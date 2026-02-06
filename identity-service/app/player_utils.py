from typing import Any, Dict, List, Optional


def serialize_player(player: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(player)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    data.pop("password", None)
    return data


def compute_player_participation(
    player_reg_number: str,
    sports: List[Dict[str, Any]],
) -> Dict[str, List[Any]]:
    participated_in: List[Dict[str, Any]] = []
    captain_in: List[str] = []
    coordinator_in: List[str] = []

    for sport in sports:
        sport_name = sport.get("name")
        eligible_coordinators = sport.get("eligible_coordinators") or []
        if player_reg_number in eligible_coordinators:
            coordinator_in.append(sport_name)

        eligible_captains = sport.get("eligible_captains") or []
        teams = sport.get("teams_participated") or []
        captain_team = next((team for team in teams if team.get("captain") == player_reg_number), None)
        if captain_team:
            captain_in.append(sport_name)
            participated_in.append({"sport": sport_name, "team_name": captain_team.get("team_name")})
        elif player_reg_number in eligible_captains:
            captain_in.append(sport_name)
        else:
            team_member = next(
                (
                    team
                    for team in teams
                    if player_reg_number in (team.get("players") or [])
                ),
                None,
            )
            if team_member:
                participated_in.append({"sport": sport_name, "team_name": team_member.get("team_name")})
            else:
                players_participated = sport.get("players_participated") or []
                if player_reg_number in players_participated:
                    participated_in.append({"sport": sport_name, "team_name": None})

    return {
        "participated_in": participated_in,
        "captain_in": captain_in,
        "coordinator_in": coordinator_in,
    }


def compute_players_participation_batch(
    reg_numbers: List[str],
    sports: List[Dict[str, Any]],
) -> Dict[str, Dict[str, List[Any]]]:
    result: Dict[str, Dict[str, List[Any]]] = {}
    for reg_number in reg_numbers:
        result[reg_number] = {
            "participated_in": [],
            "captain_in": [],
            "coordinator_in": [],
        }

    for sport in sports:
        sport_name = sport.get("name")

        for reg_number in sport.get("eligible_coordinators") or []:
            if reg_number in result:
                result[reg_number]["coordinator_in"].append(sport_name)

        teams = sport.get("teams_participated") or []
        for team in teams:
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
                    item["sport"] == sport_name and item["team_name"] is not None
                    for item in result[reg_number]["participated_in"]
                )
                if not has_team:
                    result[reg_number]["participated_in"].append(
                        {"sport": sport_name, "team_name": None}
                    )

    return result
