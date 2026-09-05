"""
Centralized exception handling. Ensures production responses never leak
stack traces, database errors, filesystem paths, or other internal details -
every unhandled exception is logged server-side with full detail and
returned to the client as a generic, structured error.
"""
from __future__ import annotations

import traceback
import uuid

import structlog
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.settings.config import get_settings

logger = structlog.get_logger("app.errors")
settings = get_settings()


def _debug_fields(exc: Exception) -> dict:
    # Only ever included outside production - see call sites below. Helps
    # local/dev debugging without requiring direct access to container logs.
    if settings.ENVIRONMENT == "production":
        return {}
    return {"debug_exception": repr(exc), "debug_traceback": traceback.format_exc()}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"message": exc.detail, "status_code": exc.status_code}},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "message": "Validation failed",
                    "status_code": 422,
                    "details": exc.errors(),
                }
            },
        )

    @app.exception_handler(ResponseValidationError)
    async def response_validation_exception_handler(request: Request, exc: ResponseValidationError):
        # This means a route handler returned data that doesn't match its
        # declared response_model - a server-side bug, not a client error.
        # repr()/str() on this exception type can itself raise, so pull the
        # structured .errors() directly rather than formatting the
        # exception object.
        error_id = uuid.uuid4().hex
        try:
            details = exc.errors()
        except Exception:
            details = None
        logger.error(
            "response_validation_error",
            error_id=error_id,
            path=request.url.path,
            details=details,
        )
        debug: dict = {}
        if settings.ENVIRONMENT != "production":
            debug = {"debug_response_validation_errors": details}
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": "An internal error occurred. Please try again later.",
                    "status_code": 500,
                    "error_id": error_id,
                    **debug,
                }
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_exception_handler(request: Request, exc: SQLAlchemyError):
        error_id = uuid.uuid4().hex
        # Full detail goes server-side only. Never returned to the client.
        logger.error(
            "database_error",
            error_id=error_id,
            path=request.url.path,
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": "An internal error occurred. Please try again later.",
                    "status_code": 500,
                    "error_id": error_id,
                    **_debug_fields(exc),
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        error_id = uuid.uuid4().hex
        logger.error(
            "unhandled_exception",
            error_id=error_id,
            path=request.url.path,
            exc_info=exc,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": "An internal error occurred. Please try again later.",
                    "status_code": 500,
                    "error_id": error_id,
                    **_debug_fields(exc),
                }
            },
        )
