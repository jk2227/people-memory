import os
import sys
import json
import time
import traceback
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from functools import wraps
from flask import Flask, request, jsonify
from werkzeug.exceptions import HTTPException

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


class SupabaseError(Exception):
    def __init__(self, status, body):
        self.status = status
        self.body = body
        super().__init__(f"Supabase {status}: {body}")


def sb_request(method, path, body=None, extra_headers=None):
    """Make a request to the Supabase REST API. Retries GETs once on transient errors."""
    headers = sb_headers()
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body else None
    attempts = 2 if method == "GET" else 1
    last_err = None
    for attempt in range(attempts):
        req = urllib.request.Request(f"{REST_URL}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            last_err = SupabaseError(e.code, err_body)
            if e.code < 500:
                break
        except urllib.error.URLError as e:
            last_err = SupabaseError(0, str(e.reason))
        if attempt < attempts - 1:
            time.sleep(0.5)
    raise last_err


@app.errorhandler(SupabaseError)
def handle_supabase_error(e):
    print(f"Supabase request failed: {e}", file=sys.stderr)
    return jsonify({"error": "Database temporarily unavailable, try again", "detail": str(e)}), 502


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    if isinstance(e, HTTPException):
        return e
    traceback.print_exc()
    return jsonify({"error": "Internal server error", "detail": str(e)}), 500


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
        if e.code >= 500:
            raise SupabaseError(e.code, body)
        return None, f"Auth error {e.code}: {body}"
    except SupabaseError:
        raise
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


# ─── Clothes ───


def verify_clothing_ownership(user_id, clothing_id):
    """Check that clothing item belongs to user."""
    q = urllib.parse.quote
    path = f"/clothes?select=id&id=eq.{q(clothing_id)}&user_id=eq.{q(user_id)}"
    result = sb_request("GET", path)
    return len(result) > 0


@app.route("/api/clothes", methods=["GET"])
@require_auth
def list_clothes(user_id):
    q = urllib.parse.quote
    path = f"/clothes?select=*,clothing_wears(id,wear_type,created_at)&user_id=eq.{q(user_id)}&order=created_at.asc"
    clothes = sb_request("GET", path)
    for item in clothes:
        wears = item.get("clothing_wears") or []
        wears.sort(key=lambda w: w["created_at"])
        item["wears"] = wears
        del item["clothing_wears"]
    return jsonify(clothes)


@app.route("/api/clothes", methods=["POST"])
@require_auth
def create_clothing(user_id):
    data = request.get_json()
    name = (data.get("name") or "").strip()
    category = (data.get("category") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not category:
        return jsonify({"error": "Category is required"}), 400

    row = {"user_id": user_id, "name": name, "category": category}
    result = sb_request("POST", "/clothes", row)
    result[0]["wears"] = []
    return jsonify(result[0]), 201


@app.route("/api/clothes/<clothing_id>", methods=["DELETE"])
@require_auth
def delete_clothing(user_id, clothing_id):
    if not verify_clothing_ownership(user_id, clothing_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/clothes?id=eq.{q(clothing_id)}&user_id=eq.{q(user_id)}")
    return jsonify({"ok": True})


@app.route("/api/clothes/<clothing_id>/wears", methods=["POST"])
@require_auth
def add_wear(user_id, clothing_id):
    if not verify_clothing_ownership(user_id, clothing_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json()
    wear_type = (data.get("wear_type") or "").strip().upper()
    if wear_type not in ("BW", "JL", "FD"):
        return jsonify({"error": "wear_type must be BW, JL, or FD"}), 400

    result = sb_request("POST", "/clothing_wears", {"clothing_id": clothing_id, "wear_type": wear_type})
    return jsonify(result[0]), 201


@app.route("/api/clothes/<clothing_id>/wears/<wear_id>", methods=["DELETE"])
@require_auth
def remove_wear(user_id, clothing_id, wear_id):
    if not verify_clothing_ownership(user_id, clothing_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/clothing_wears?id=eq.{q(wear_id)}&clothing_id=eq.{q(clothing_id)}")
    return jsonify({"ok": True})


@app.route("/api/clothes/<clothing_id>/wash", methods=["POST"])
@require_auth
def wash_clothing(user_id, clothing_id):
    if not verify_clothing_ownership(user_id, clothing_id):
        return jsonify({"error": "Not found"}), 404

    q = urllib.parse.quote
    sb_request("DELETE", f"/clothing_wears?clothing_id=eq.{q(clothing_id)}")
    return jsonify({"ok": True})


# ─── Stories ───


def verify_story_ownership(user_id, story_id):
    q = urllib.parse.quote
    path = f"/stories?select=id&id=eq.{q(story_id)}&user_id=eq.{q(user_id)}"
    result = sb_request("GET", path)
    return len(result) > 0


@app.route("/api/stories", methods=["GET"])
@require_auth
def list_stories(user_id):
    q = urllib.parse.quote
    path = f"/stories?select=*&user_id=eq.{q(user_id)}&order=updated_at.desc"
    return jsonify(sb_request("GET", path))


@app.route("/api/stories", methods=["POST"])
@require_auth
def create_story(user_id):
    data = request.get_json() or {}
    row = {
        "user_id": user_id,
        "title": (data.get("title") or "").strip(),
        "content": data.get("content") or "",
    }
    result = sb_request("POST", "/stories", row)
    return jsonify(result[0]), 201


@app.route("/api/stories/<story_id>", methods=["GET"])
@require_auth
def get_story(user_id, story_id):
    q = urllib.parse.quote
    result = sb_request("GET", f"/stories?id=eq.{q(story_id)}&user_id=eq.{q(user_id)}")
    if not result:
        return jsonify({"error": "Not found"}), 404
    return jsonify(result[0])


@app.route("/api/stories/<story_id>", methods=["PUT"])
@require_auth
def update_story(user_id, story_id):
    if not verify_story_ownership(user_id, story_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json() or {}
    updates = {}
    if "title" in data:
        updates["title"] = (data["title"] or "").strip()
    if "content" in data:
        updates["content"] = data["content"] or ""

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        q = urllib.parse.quote
        sb_request("PATCH", f"/stories?id=eq.{q(story_id)}", updates)

    return jsonify({"ok": True})


@app.route("/api/stories/<story_id>", methods=["DELETE"])
@require_auth
def delete_story(user_id, story_id):
    q = urllib.parse.quote
    sb_request("DELETE", f"/stories?id=eq.{q(story_id)}&user_id=eq.{q(user_id)}")
    return jsonify({"ok": True})
