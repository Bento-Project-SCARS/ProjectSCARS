from typing import Any

from fastapi.testclient import TestClient
from httpx import Response

from localserver import app
from localserver.info import Database

TEST_USERS = {
    "testuser1": 1,
    "testuser2": 2,
    "testuser3": 3,
    "testuser4": 4,
}

client = TestClient(app)


def _request_access_token(username: str, password: str) -> Response:
    """Log in a user and return the access token."""

    creds: dict[str, str] = {
        "username": username,
        "password": password,
    }

    return client.post("/api/v1/auth/token", data=creds)


def test_login_user_success():
    """Test logging in a user successfully."""

    response = _request_access_token(Database.default_user, Database.default_password)
    assert response.status_code == 200
    resp_data: dict[str, Any] = response.json()
    assert type(resp_data["access_token"]) is str
    assert resp_data["token_type"] == "bearer"


def test_login_user_wrong_password():
    """Test failing to log in a user with a wrong password."""

    response = _request_access_token(
        Database.default_user, Database.default_password + "wrong_password"
    )
    assert response.status_code == 401
    resp_data: dict[str, Any] = response.json()
    assert resp_data["detail"] == "Invalid credentials"


def test_login_user_wrong_username():
    """Test failing to log in a user with a wrong username."""

    response = _request_access_token(
        Database.default_user + "wrong_username", Database.default_password
    )
    assert response.status_code == 401
    resp_data: dict[str, Any] = response.json()
    assert resp_data["detail"] == "Invalid credentials"


def test_login_user_wrong_username_and_password():
    """Test failing to log in a user with both username and password wrong."""

    response = _request_access_token(
        Database.default_user + "wrong_username",
        Database.default_password + "wrong_password",
    )
    assert response.status_code == 401
    resp_data: dict[str, Any] = response.json()
    assert resp_data["detail"] == "Invalid credentials"


def test_create_user_success():
    """Test creating a user successfully."""

    login = _request_access_token(Database.default_user, Database.default_password)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    for user in TEST_USERS.items():
        data: dict[str, Any] = {
            "username": user[0],
            "roleId": user[1],
            "password": "Password123",
        }
        response = client.post(
            "/api/v1/auth/create",
            json=data,
            headers=headers,
        )
        assert response.status_code == 201
        resp_data: dict[str, Any] = response.json()
        assert type(resp_data["id"]) is str
        assert resp_data["username"] == data["username"]
        assert resp_data["nameFirst"] is None
        assert resp_data["nameMiddle"] is None
        assert resp_data["nameLast"] is None
        assert resp_data["avatarUrl"] is None
        assert resp_data["roleId"] == data["roleId"]
        assert resp_data["deactivated"] is False

    response = client.get("/api/v1/users/get", headers=headers)
    for user in TEST_USERS.items():
        assert user[0] in [u["username"] for u in response.json()]

    assert response.status_code == 200


def test_create_user_missing_required_field():
    """Test creating a user with a missing required field."""

    login = _request_access_token(Database.default_user, Database.default_password)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    data: dict[str, Any] = {
        "username": "testuser3",
        "password": "Password123",
    }
    response = client.post(
        "/api/v1/auth/create",
        json=data,
        headers=headers,
    )
    assert response.status_code == 422
    resp_data = response.json()
    assert resp_data["detail"][0]["type"] == "missing"
    assert "roleId" in resp_data["detail"][0]["loc"]
    assert resp_data["detail"][0]["msg"] == "Field required"


def test_create_user_missing_username():
    """Test creating a user with a missing username."""

    login = _request_access_token(Database.default_user, Database.default_password)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post(
        "/api/v1/auth/create",
        json={
            "roleId": 2,
            "password": "Password123",
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert "username" in response.json()["detail"][0]["loc"]


def test_create_user_short_username():
    login = _request_access_token(Database.default_user, Database.default_password)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post(
        "/api/v1/auth/create",
        json={
            "username": "ab",
            "roleId": 2,
            "password": "Password123",
        },
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid username"


def test_create_user_invalid_data_types():
    """Test creating a user with invalid data types."""

    login = _request_access_token(Database.default_user, Database.default_password)
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post(
        "/api/v1/auth/create",
        json={
            "username": 12345,
            "roleId": 2,
            "password": "Password123",
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert "username" in response.json()["detail"][0]["loc"]
