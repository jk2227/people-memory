import os
import json
import urllib.request
import urllib.error
import urllib.parse
from functools import wraps
from flask import Flask, request, jsonify

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
REST_URL = f"{SUPABASE_URL}/rest/v1"
AUTH_URL = f"{SUPABASE_URL}/auth/v1"


def sb_headers():
    """Headers for Supabase REST API (service role)."""
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def sb_request(method, path, body=None, extra_headers=None):
    """Make a request to the Supabase REST API."""
    headers = sb_headers()
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{REST_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise Exception(f"Supabase {e.code}: {err_body}")


def get_user_id():
    """Verify the user's token directly against the Supabase Auth API."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "No Bearer token"
    token = auth_header.split(" ", 1)[1]

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None, "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

    try:
        req = urllib.request.Request(
            f"{AUTH_URL}/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            uid = data.get("id")
            if not uid:
                return None, f"No id in response"
            return uid, None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return None, f"Auth error {e.code}: {body}"
    except Exception as e:
        return None, f"Auth exception: {str(e)}"


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user_id, error = get_user_id()
        if not user_id:
            return jsonify({"error": "Unauthorized", "detail": error}), 401
        return f(user_id, *args, **kwargs)
    return wrapper


def verify_ownership(user_id, person_id):
    """Check that person belongs to user. Returns True/False."""
    q = urllib.parse.quote
    path = f"/people?select=id&id=eq.{q(person_id)}&user_id=eq.{q(user_id)}"
    result = sb_request("GET", path)
    return len(result) > 0


# ─── People ───


@app.route("/api/people", methods=["GET"])
@require_auth
def list_people(user_id):
    q = urllib.parse.quote
    path = f"/people?select=*,interactions(id,text,occurred_at)&user_id=eq.{q(user_id)}&order=created_at.desc"
    people = sb_request("GET", path)

    for p in people:
        interactions = p.get("interactions") or []
        interactions.sort(key=lambda x: x["occurred_at"], reverse=True)
        p["latest_interaction"] = interactions[0] if interactions else None
        p["interaction_count"] = len(interactions)
        del p["interactions"]

    people.sort(
        key=lambda p: p["latest_interaction"]["occurred_at"]
        if p["latest_interaction"]
        else p["created_at"],
        reverse=True,
    )
    return jsonify(people)


@app.route("/api/people", methods=["POST"])
@require_auth
def create_person(user_id):
    data = request.get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400

    row = {
        "user_id": user_id,
        "name": name,
        "relationship": (data.get("relationship") or "").strip(),
    }
    result = sb_request("POST", "/people", row)
    return jsonify(result[0]), 201


@app.route("/api/people/<person_id>", methods=["GET"])
@require_auth
def get_person(user_id, person_id):
    q = urllib.parse.quote
    people = sb_request("GET", f"/people?id=eq.{q(person_id)}&user_id=eq.{q(user_id)}")
    if not people:
        return jsonify({"error": "Not found"}), 404

    person = people[0]
    person["facts"] = sb_request("GET", f"/facts?person_id=eq.{q(person_id)}&order=created_at.asc")
    person["told"] = sb_request("GET", f"/told?person_id=eq.{q(person_id)}&order=created_at.asc")
    person["interactions"] = sb_request("GET", f"/interactions?person_id=eq.{q(person_id)}&order=occurred_at.desc")
    return jsonify(person)


@app.route("/api/people/<person_id>", methods=["PUT"])
@require_auth
def update_person(user_id, person_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json()
    updates = {}
    if "name" in data:
        updates["name"] = data["name"].strip()
    if "relationship" in data:
        updates["relationship"] = data["relationship"].strip()

    if updates:
        q = urllib.parse.quote
        sb_request("PATCH", f"/people?id=eq.{q(person_id)}", updates)

    return jsonify({"ok": True})


@app.route("/api/people/<person_id>", methods=["DELETE"])
@require_auth
def delete_person(user_id, person_id):
    q = urllib.parse.quote
    sb_request("DELETE", f"/people?id=eq.{q(person_id)}&user_id=eq.{q(user_id)}")
    return jsonify({"ok": True})


# ─── Facts ───


@app.route("/api/people/<person_id>/facts", methods=["POST"])
@require_auth
def add_fact(user_id, person_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    result = sb_request("POST", "/facts", {"person_id": person_id, "text": text})
    return jsonify(result[0]), 201


@app.route("/api/people/<person_id>/facts/<fact_id>", methods=["DELETE"])
@require_auth
def remove_fact(user_id, person_id, fact_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/facts?id=eq.{q(fact_id)}&person_id=eq.{q(person_id)}")
    return jsonify({"ok": True})


# ─── Told ───


@app.route("/api/people/<person_id>/told", methods=["POST"])
@require_auth
def add_told(user_id, person_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    result = sb_request("POST", "/told", {"person_id": person_id, "text": text})
    return jsonify(result[0]), 201


@app.route("/api/people/<person_id>/told/<told_id>", methods=["DELETE"])
@require_auth
def remove_told(user_id, person_id, told_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/told?id=eq.{q(told_id)}&person_id=eq.{q(person_id)}")
    return jsonify({"ok": True})


# ─── Interactions ───


@app.route("/api/people/<person_id>/interactions", methods=["POST"])
@require_auth
def add_interaction(user_id, person_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    row = {"person_id": person_id, "text": text}
    if data.get("date"):
        row["occurred_at"] = data["date"]

    result = sb_request("POST", "/interactions", row)
    return jsonify(result[0]), 201


@app.route("/api/people/<person_id>/interactions/<interaction_id>", methods=["DELETE"])
@require_auth
def remove_interaction(user_id, person_id, interaction_id):
    if not verify_ownership(user_id, person_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/interactions?id=eq.{q(interaction_id)}&person_id=eq.{q(person_id)}")
    return jsonify({"ok": True})
