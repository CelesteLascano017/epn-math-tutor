from fastapi import APIRouter

router = APIRouter(tags=["user"])


@router.get("/me")
def get_current_user():
    """Returns the fixed TutorMath user profile (no auth in V1)."""
    return {
        "id": "tutormath-user",
        "name": "Estudiante EPN",
        "email": "estudiante@epn.edu.ec",
        "avatarUrl": None,
    }
