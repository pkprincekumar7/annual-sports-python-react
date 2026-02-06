from typing import Any, Dict, List

from .db import sports_collection


def serialize_player(player: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(player)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    data.pop("password", None)
    return data


async def compute_players_participation_batch(
    player_reg_numbers: List[str],
    event_id: str,
) -> Dict[str, Dict[str, List[Any]]]:
    if not player_reg_numbers:
        return {}

    result: Dict[str, Dict[str, List[Any]]] = {
        reg: {"participated_in": [], "captain_in": [], "coordinator_in": []}
        for reg in player_reg_numbers
    }

    sports = await sports_collection().find(
        {
            "event_id": str(event_id).strip().lower(),
            "$or": [
                {"eligible_captains": {"$in": player_reg_numbers}},
                {"teams_participated.captain": {"$in": player_reg_numbers}},
                {"teams_participated.players": {"$in": player_reg_numbers}},
                {"players_participated": {"$in": player_reg_numbers}},
                {"eligible_coordinators": {"$in": player_reg_numbers}},
            ],
        }
    ).to_list(length=None)

    for sport in sports:
        sport_name = sport.get("name")

        for reg_number in sport.get("eligible_coordinators") or []:
            if reg_number in result:
                result[reg_number]["coordinator_in"].append(sport_name)

        for team in sport.get("teams_participated") or []:
            captain = team.get("captain")
            if captain in result:
                result[captain]["captain_in"].append(sport_name)
                result[captain]["participated_in"].append(
                    {"sport": sport_name, "team_name": team.get("team_name")}
                )
            for member in team.get("players") or []:
                if member in result and member != captain:
                    result[member]["participated_in"].append(
                        {"sport": sport_name, "team_name": team.get("team_name")}
                    )

        for reg_number in sport.get("eligible_captains") or []:
            if reg_number in result and sport_name not in result[reg_number]["captain_in"]:
                result[reg_number]["captain_in"].append(sport_name)

        for reg_number in sport.get("players_participated") or []:
            if reg_number in result:
                has_team = any(
                    entry["sport"] == sport_name and entry["team_name"] is not None
                    for entry in result[reg_number]["participated_in"]
                )
                if not has_team:
                    result[reg_number]["participated_in"].append(
                        {"sport": sport_name, "team_name": None}
                    )

    return result
