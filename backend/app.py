import os
from uuid import UUID

from flask import Flask, jsonify, request
from supabase import create_client, Client
from postgrest import APIError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


@app.after_request
def enable_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_PUBLISHABLE_KEY")
)
@app.route('/')
def index():
    try:
        response = supabase.table('users').select("*").execute()
    except APIError as error:
        return f'<p>Error loading users: {error.message}</p>'

    users = response.data

    html = '<h1>users</h1><ul>'
    for users in users:
        html += f'<li>{users["email"]}</li>'
    html += '</ul>'

    return html


def is_valid_uuid(value):
    try:
        UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def database_error(error):
    app.logger.error("Supabase request failed: %s", error)
    return jsonify({"error": "Database request failed"}), 500


@app.get('/api/events')
def list_events():
    try:
        response = supabase.table('events').select('*').execute()
    except APIError as error:
        return database_error(error)
    return jsonify(response.data)


@app.get('/api/events/<event_id>')
def get_event(event_id):
    if not is_valid_uuid(event_id):
        return jsonify({"error": "event id must be a UUID"}), 400

    try:
        response = supabase.table('events').select('*').eq('id', event_id).limit(1).execute()
    except APIError as error:
        return database_error(error)

    if not response.data:
        return jsonify({"error": "Event not found"}), 404
    return jsonify(response.data[0])


@app.post('/api/registrations')
def create_registration():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    user_id = payload.get('user_id')
    event_id = payload.get('event_id')
    if not is_valid_uuid(user_id) or not is_valid_uuid(event_id):
        return jsonify({"error": "user_id and event_id must be UUIDs"}), 400

    try:
        event_response = supabase.table('events').select('id, capacity').eq('id', event_id).limit(1).execute()
        if not event_response.data:
            return jsonify({"error": "Event not found"}), 404

        user_response = supabase.table('users').select('id').eq('id', user_id).limit(1).execute()
        if not user_response.data:
            return jsonify({"error": "User not found"}), 404

        duplicate_response = (
            supabase.table('registrations')
            .select('id')
            .eq('user_id', user_id)
            .eq('event_id', event_id)
            .limit(1)
            .execute()
        )
        if duplicate_response.data:
            return jsonify({"error": "User is already registered for this event"}), 409

        event = event_response.data[0]
        if event.get('capacity') is not None:
            count_response = (
                supabase.table('registrations')
                .select('id', count='exact', head=True)
                .eq('event_id', event_id)
                .execute()
            )
            if (count_response.count or 0) >= event['capacity']:
                return jsonify({"error": "Event is at capacity"}), 409

        insert_response = (
            supabase.table('registrations')
            .insert({"user_id": user_id, "event_id": event_id})
            .execute()
        )
    except APIError as error:
        return database_error(error)

    registration = insert_response.data[0] if insert_response.data else {
        "user_id": user_id,
        "event_id": event_id,
    }
    return jsonify(registration), 201


@app.get('/api/me/registrations')
def list_user_registrations():
    user_id = request.args.get('user_id')
    if not is_valid_uuid(user_id):
        return jsonify({"error": "A valid user_id query parameter is required"}), 400

    try:
        response = (
            supabase.table('registrations')
            .select('*')
            .eq('user_id', user_id)
            .execute()
        )
    except APIError as error:
        return database_error(error)
    return jsonify(response.data)


@app.get('/api/events/<event_id>/registrations')
def list_event_registrations(event_id):
    if not is_valid_uuid(event_id):
        return jsonify({"error": "event id must be a UUID"}), 400

    try:
        registration_response = (
            supabase.table('registrations')
            .select('*')
            .eq('event_id', event_id)
            .execute()
        )
        registrations = registration_response.data
        user_ids = list({registration['user_id'] for registration in registrations})
        users_by_id = {}
        if user_ids:
            user_response = supabase.table('users').select('id, email').in_('id', user_ids).execute()
            users_by_id = {user['id']: user.get('email') for user in user_response.data}
    except APIError as error:
        return database_error(error)

    attendees = [
        {**registration, "email": users_by_id.get(registration['user_id'])}
        for registration in registrations
    ]
    return jsonify(attendees)

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=os.environ.get('FLASK_DEBUG') == '1',
    )
