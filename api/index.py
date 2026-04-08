import os
import json
import jwt
from flask import Flask, request, jsonify
from supabase import create_client

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")


def get_db():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_user_id():
    """Extract and verify user ID from the Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def require_auth(f):
    """Decorator that injects user_id or returns 401."""
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        user_id = get_user_id()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401
        return f(user_id, *args, **kwargs)

    return wrapper


# ─── People ───


@app.route("/api/people", methods=["GET"])
@require_auth
def list_people(user_id):
    db = get_db()
    result = (
        db.table("people")
        .select("*, interactions(id, text, occurred_at)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    # Attach latest interaction and sort by recency
    people = result.data or []
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

    db = get_db()
    result = (
        db.table("people")
        .insert(
            {
                "user_id": user_id,
                "name": name,
                "relationship": (data.get("relationship") or "").strip(),
            }
        )
        .execute()
    )
    return jsonify(result.data[0]), 201


@app.route("/api/people/<person_id>", methods=["GET"])
@require_auth
def get_person(user_id, person_id):
    db = get_db()
    # Verify ownership
    person = (
        db.table("people")
        .select("*")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not person.data:
        return jsonify({"error": "Not found"}), 404

    # Fetch related data
    facts = (
        db.table("facts")
        .select("*")
        .eq("person_id", person_id)
        .order("created_at")
        .execute()
    )
    told = (
        db.table("told")
        .select("*")
        .eq("person_id", person_id)
        .order("created_at")
        .execute()
    )
    interactions = (
        db.table("interactions")
        .select("*")
        .eq("person_id", person_id)
        .order("occurred_at", desc=True)
        .execute()
    )

    result = person.data
    result["facts"] = facts.data or []
    result["told"] = told.data or []
    result["interactions"] = interactions.data or []
    return jsonify(result)


@app.route("/api/people/<person_id>", methods=["PUT"])
@require_auth
def update_person(user_id, person_id):
    data = request.get_json()
    db = get_db()

    # Verify ownership
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    updates = {}
    if "name" in data:
        updates["name"] = data["name"].strip()
    if "relationship" in data:
        updates["relationship"] = data["relationship"].strip()

    if updates:
        db.table("people").update(updates).eq("id", person_id).execute()

    return jsonify({"ok": True})


@app.route("/api/people/<person_id>", methods=["DELETE"])
@require_auth
def delete_person(user_id, person_id):
    db = get_db()
    # Verify ownership then delete (cascade handles related rows)
    db.table("people").delete().eq("id", person_id).eq("user_id", user_id).execute()
    return jsonify({"ok": True})


# ─── Facts ───


@app.route("/api/people/<person_id>/facts", methods=["POST"])
@require_auth
def add_fact(user_id, person_id):
    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    db = get_db()
    # Verify ownership
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    result = (
        db.table("facts")
        .insert({"person_id": person_id, "text": text})
        .execute()
    )
    return jsonify(result.data[0]), 201


@app.route("/api/people/<person_id>/facts/<fact_id>", methods=["DELETE"])
@require_auth
def remove_fact(user_id, person_id, fact_id):
    db = get_db()
    # Verify ownership through person
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    db.table("facts").delete().eq("id", fact_id).eq("person_id", person_id).execute()
    return jsonify({"ok": True})


# ─── Told (Things they already know) ───


@app.route("/api/people/<person_id>/told", methods=["POST"])
@require_auth
def add_told(user_id, person_id):
    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    db = get_db()
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    result = (
        db.table("told")
        .insert({"person_id": person_id, "text": text})
        .execute()
    )
    return jsonify(result.data[0]), 201


@app.route("/api/people/<person_id>/told/<told_id>", methods=["DELETE"])
@require_auth
def remove_told(user_id, person_id, told_id):
    db = get_db()
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    db.table("told").delete().eq("id", told_id).eq("person_id", person_id).execute()
    return jsonify({"ok": True})


# ─── Interactions ───


@app.route("/api/people/<person_id>/interactions", methods=["POST"])
@require_auth
def add_interaction(user_id, person_id):
    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400

    db = get_db()
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    result = (
        db.table("interactions")
        .insert({"person_id": person_id, "text": text})
        .execute()
    )
    return jsonify(result.data[0]), 201


@app.route("/api/people/<person_id>/interactions/<interaction_id>", methods=["DELETE"])
@require_auth
def remove_interaction(user_id, person_id, interaction_id):
    db = get_db()
    check = (
        db.table("people")
        .select("id")
        .eq("id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return jsonify({"error": "Not found"}), 404

    db.table("interactions").delete().eq("id", interaction_id).eq(
        "person_id", person_id
    ).execute()
    return jsonify({"ok": True})
