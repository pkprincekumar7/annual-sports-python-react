from typing import Dict, List, Optional

from .external_services import get_batches


async def get_players_batch_names(
    reg_numbers: List[str],
    event_id: str,
    token: str = "",
) -> Dict[str, Optional[str]]:
    if not reg_numbers or not event_id:
        return {}

    batch_names: Dict[str, Optional[str]] = {reg: None for reg in reg_numbers}
    try:
        batches = await get_batches(event_id, token=token)
        for batch in batches:
            for reg in batch.get("players") or []:
                if reg in batch_names:
                    batch_names[reg] = batch.get("name")
    except Exception:
        return batch_names
    return batch_names
