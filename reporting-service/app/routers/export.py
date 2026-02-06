from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from openpyxl import Workbook

from ..auth import admin_dependency, auth_dependency
from ..batch_helpers import get_players_batch_names
from ..external_services import fetch_players, fetch_sports, get_event_year
from ..player_helpers import compute_players_participation_batch


router = APIRouter()


@router.get("/export-excel")
async def export_excel(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    event_id_query = request.query_params.get("event_id")

    event_year_doc = None
    event_id = None
    try:
        event_year_data = await get_event_year(
            event_id_query,
            return_doc=True,
            token=request.state.token,
        )
        event_year_doc = event_year_data.get("doc")
        event_id = event_year_doc.get("event_id") if event_year_doc else None
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            event_year_doc = None
            event_id = None
        else:
            raise

    sports = await fetch_sports(event_id, token=request.state.token) if event_id else []
    sport_columns = [
        {
            "header": str(sport.get("name", "")).upper(),
            "sport": sport.get("name"),
            "type": sport.get("type"),
            "category": sport.get("category"),
        }
        for sport in sports
    ]

    players = await fetch_players(event_id, token=request.state.token)
    reg_numbers = [player.get("reg_number") for player in players if player.get("reg_number")]
    participation_map = (
        compute_players_participation_batch(reg_numbers, sports) if event_id else {}
    )
    batch_map = (
        await get_players_batch_names(reg_numbers, event_id, token=request.state.token)
        if event_id
        else {}
    )

    headers: List[str] = [
        "REG Number",
        "Full Name",
        "Gender",
        "Department/Branch",
        "Year",
        "Mobile Number",
        "Email Id",
    ]
    for column in sport_columns:
        headers.append(column["header"])
        if column.get("type") in {"dual_team", "multi_team"}:
            headers.append(f"{column['header']}_TEAM")

    rows: List[Dict[str, Any]] = []
    for player in players:
        reg_number = player.get("reg_number")
        participation = participation_map.get(
            reg_number, {"participated_in": [], "captain_in": [], "coordinator_in": []}
        )
        year_display = batch_map.get(reg_number, "") if event_id else ""

        row: Dict[str, Any] = {
            "REG Number": reg_number or "",
            "Full Name": player.get("full_name") or "",
            "Gender": player.get("gender") or "",
            "Department/Branch": player.get("department_branch") or "",
            "Year": year_display or "",
            "Mobile Number": player.get("mobile_number") or "",
            "Email Id": player.get("email_id") or "",
        }

        for column in sport_columns:
            header = column["header"]
            sport_name = column.get("sport")
            is_team_sport = column.get("type") in {"dual_team", "multi_team"}
            is_captain = sport_name in (participation.get("captain_in") or [])
            participation_entry = next(
                (p for p in participation.get("participated_in") or [] if p.get("sport") == sport_name),
                None,
            )
            is_participant = participation_entry is not None
            if is_team_sport:
                if is_captain:
                    row[header] = "CAPTAIN"
                elif is_participant:
                    row[header] = "PARTICIPANT"
                else:
                    row[header] = "NA"
                team_header = f"{header}_TEAM"
                row[team_header] = (
                    participation_entry.get("team_name")
                    if participation_entry and participation_entry.get("team_name")
                    else "NA"
                )
            else:
                row[header] = "PARTICIPANT" if is_participant else "NA"
        rows.append(row)

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Players Report"
    worksheet.append(headers)

    for row in rows:
        worksheet.append([row.get(header, "") for header in headers])

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    event_year_label = event_year_doc.get("event_year") if event_year_doc else "no-event"
    filename = f"Players_Report_{event_year_label}_{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
