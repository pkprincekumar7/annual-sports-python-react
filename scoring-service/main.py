import logging
import logging.config
import time
from pathlib import Path
from uuid import uuid4

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse

from app.auth import _ResponseException
from app.config import get_settings
from app.date_restrictions import check_registration_deadline
from app.errors import send_error_response
from app.routers import points_table as points_table_router


settings = get_settings()
logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"default": {"format": "%(message)s"}},
        "handlers": {"default": {"class": "logging.StreamHandler", "formatter": "default"}},
        "root": {"handlers": ["default"], "level": settings.log_level},
    }
)
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.CallsiteParameterAdder(
            parameters=[
                structlog.processors.CallsiteParameter.PATHNAME,
                structlog.processors.CallsiteParameter.LINENO,
            ]
        ),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

app = FastAPI(title="Scoring Service", version="0.1.0", docs_url=None, redoc_url=None)
logger = structlog.get_logger("scoring-service")
swagger_path = Path(__file__).with_name("swagger.yaml")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(_ResponseException)
async def response_exception_handler(_: Request, exc: _ResponseException):
    return exc.response


@app.middleware("http")
async def no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.middleware("http")
async def strip_trailing_slash(request: Request, call_next):
    path = request.scope.get("path") or ""
    if path != "/" and path.endswith("/"):
        request.scope["path"] = path.rstrip("/")
    return await call_next(request)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid4())
    request.state.request_id = request_id
    start_time = time.time()

    bound_logger = logger.bind(request_id=request_id)
    response = await call_next(request)

    duration_ms = int((time.time() - start_time) * 1000)
    response.headers["X-Request-Id"] = request_id

    user = getattr(request.state, "user", None) or {}
    if user.get("reg_number"):
        bound_logger = bound_logger.bind(user_reg_number=user.get("reg_number"))

    bound_logger.info(
        "request.completed",
        method=request.method,
        path=str(request.url.path),
        status_code=response.status_code,
        duration_ms=duration_ms,
        client_host=request.client.host if request.client else None,
    )
    return response


@app.middleware("http")
async def registration_deadline_middleware(request: Request, call_next):
    if request.url.path.startswith("/scorings"):
        response = await check_registration_deadline(request)
        if response is not None:
            return response
    return await call_next(request)


app.include_router(points_table_router.router, prefix="/scorings")


@app.get("/scorings/swagger.yaml", include_in_schema=False)
async def swagger_spec():
    return FileResponse(swagger_path, media_type="application/yaml")


@app.get("/scorings/swagger.yml", include_in_schema=False)
async def swagger_spec_alias():
    return FileResponse(swagger_path, media_type="application/yaml")


@app.get("/scorings/docs", include_in_schema=False)
async def swagger_ui():
    return HTMLResponse(
        get_swagger_ui_html(
            openapi_url="/scorings/swagger.yaml",
            title="Scoring Service API Docs",
        ).body
    )


@app.get("/scorings/docs/", include_in_schema=False)
async def swagger_ui_slash():
    return HTMLResponse(
        get_swagger_ui_html(
            openapi_url="/scorings/swagger.yaml",
            title="Scoring Service API Docs",
        ).body
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logging.exception("Unhandled error: %s", exc)
    return send_error_response(500, "An unexpected error occurred. Please try again.")
