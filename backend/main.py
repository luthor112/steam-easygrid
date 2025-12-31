import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import base64
import glob
import json
import os
import shutil
import urllib.parse
import re

try:
    import requests
except:
    logger.log("requests failed to initialize, loading polyfill...")
    from polyfills import requests

type_dict = {
    0: "grids",
    1: "heroes",
    2: "logos",
    3: "wide_grids",
    4: "icons"
}

game_db = {
    "overrides": {},
    "games": {}
}

########
# UTIL #
########

def get_config_fname():
    return os.path.join(PLUGIN_BASE_DIR, "config.json")

def get_defaults_fname():
    return os.path.join(PLUGIN_BASE_DIR, "defaults.json")

def get_cache_dir():
    return os.path.join(PLUGIN_BASE_DIR, "artcache")

def get_game_db_fname():
    return os.path.join(PLUGIN_BASE_DIR, "game_db.json")

def get_steam_root():
    """Resolve the Steam root by walking up from the plugin directory until we find userdata."""
    try:
        path = os.path.abspath(PLUGIN_BASE_DIR)
        for _ in range(5):
            candidate = os.path.abspath(path)
            if os.path.isdir(os.path.join(candidate, "userdata")):
                return candidate
            parent = os.path.abspath(os.path.join(path, os.pardir))
            if parent == path:
                break
            path = parent
    except Exception:
        pass
    return None

def pick_user_dir(userdata_path):
    """Pick a Steam user dir (numeric) by most recent mtime."""
    try:
        candidates = [
            d for d in os.listdir(userdata_path)
            if d.isdigit() and os.path.isdir(os.path.join(userdata_path, d))
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda d: os.path.getmtime(os.path.join(userdata_path, d)), reverse=True)
        return candidates[0]
    except Exception:
        return None

def write_icon_to_grid(app_id, source_path, ftype):
    """Write the icon into Steam's grid folder with _icon suffix."""
    try:
        import time
        import hashlib
        steam_root = get_steam_root()
        if not steam_root:
            logger.log("write_icon_to_grid(): Steam root not resolved")
            return
        userdata = os.path.join(steam_root, "userdata")
        if not os.path.isdir(userdata):
            logger.log(f"write_icon_to_grid(): userdata not found at {userdata}")
            return
        user_dir = pick_user_dir(userdata)
        if not user_dir:
            logger.log("write_icon_to_grid(): no user dir found")
            return
        grid_dir = os.path.join(userdata, user_dir, "config", "grid")
        os.makedirs(grid_dir, exist_ok=True)

        # If the user already has a wide/header set, Steam stores it as {appid}.png.
        # Some Steam builds also write icons into {appid}.png; preserve the wide art by restoring it if overwritten.
        plain = os.path.join(grid_dir, f"{app_id}.png")
        wide_backup = os.path.join(grid_dir, f"{app_id}_wide_backup.png")

        target = os.path.join(grid_dir, f"{app_id}_icon.{ftype}")
        shutil.copy2(source_path, target)
        logger.log(f"write_icon_to_grid(): wrote icon to {target}")

        def try_read_png_size(path):
            try:
                with open(path, "rb") as f:
                    header = f.read(24)
                if len(header) < 24:
                    return None
                # PNG signature
                if header[0:8] != b"\x89PNG\r\n\x1a\n":
                    return None
                # IHDR chunk starts at byte 12
                if header[12:16] != b"IHDR":
                    return None
                import struct
                width = struct.unpack(">I", header[16:20])[0]
                height = struct.unpack(">I", header[20:24])[0]
                return (width, height)
            except Exception:
                return None

        def sha1_file(path):
            h = hashlib.sha1()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            return h.hexdigest()

        # Snapshot current wide/header art if present (always back it up; Steam can reuse this filename)
        try:
            if os.path.exists(plain):
                plain_mtime = os.path.getmtime(plain)
                backup_mtime = os.path.getmtime(wide_backup) if os.path.exists(wide_backup) else -1
                if plain_mtime > backup_mtime:
                    shutil.copy2(plain, wide_backup)
                    logger.log(f"write_icon_to_grid(): backed up {plain} -> {wide_backup}")
        except Exception as e:
            logger.log(f"write_icon_to_grid(): failed to backup {plain}: {e}")

        # Steam may overwrite {appid}.png later (we've seen ~30s delay). Monitor in a background thread
        # and restore the backed-up file if Steam clobbers it with the icon we just downloaded.
        try:
            import threading

            try:
                icon_hash = sha1_file(source_path)
            except Exception as hash_err:
                icon_hash = None
                logger.log(f"write_icon_to_grid(): failed hashing icon source {source_path}: {hash_err}")

            def monitor_and_restore():
                try:
                    deadline = time.time() + 90.0
                    while time.time() < deadline:
                        if icon_hash and os.path.exists(plain) and os.path.exists(wide_backup):
                            try:
                                if sha1_file(plain) == icon_hash:
                                    shutil.copy2(wide_backup, plain)
                                    logger.log(
                                        f"write_icon_to_grid(): restored {wide_backup} -> {plain} (Steam overwrote with icon)"
                                    )
                            except Exception as compare_err:
                                logger.log(f"write_icon_to_grid(): monitor compare failed: {compare_err}")
                        time.sleep(1.0)
                except Exception as monitor_err:
                    logger.log(f"write_icon_to_grid(): monitor failed: {monitor_err}")

            t = threading.Thread(target=monitor_and_restore, daemon=True)
            t.start()
        except Exception as e:
            logger.log(f"write_icon_to_grid(): failed starting monitor: {e}")
    except Exception as e:
        logger.log(f"write_icon_to_grid(): failed to write icon: {e}")

def ensure_grid_icon_copy(app_id, ftype="png"):
    """
    If Steam left a plain {appid}.png/jpg in grid, copy it to {appid}_icon.<ext>.
    Does not delete the plain file to avoid fighting Steam writes.
    """
    try:
        import time
        steam_root = get_steam_root()
        if not steam_root:
            return
        userdata = os.path.join(steam_root, "userdata")
        user_dir = pick_user_dir(userdata)
        if not user_dir:
            return
        grid_dir = os.path.join(userdata, user_dir, "config", "grid")
        target = os.path.join(grid_dir, f"{app_id}_icon.{ftype}")
        legacy_candidates = [
            os.path.join(grid_dir, f"{app_id}.png"),
            os.path.join(grid_dir, f"{app_id}.jpg"),
            os.path.join(grid_dir, f"{app_id}.jpeg"),
        ]
        # Only create {appid}_icon.* if it doesn't exist. Never overwrite the user's selected icon.
        if os.path.exists(target):
            return
        for legacy_plain in legacy_candidates:
            if os.path.exists(legacy_plain):
                try:
                    shutil.copy2(legacy_plain, target)
                    logger.log(f"ensure_grid_icon_copy(): copied {legacy_plain} -> {target}")
                    break
                except Exception as e:
                    logger.log(f"ensure_grid_icon_copy(): failed to copy {legacy_plain}: {e}")
    except Exception:
        pass

def get_config():
    if not os.path.exists(get_config_fname()):
        shutil.copyfile(get_defaults_fname(), get_config_fname())

    with open(get_config_fname(), "rt") as fp:
        return json.load(fp)

def load_game_db():
    global game_db
    if os.path.exists(get_game_db_fname()):
        with open(get_game_db_fname(), "rt") as fp:
            game_db = json.load(fp)

def save_game_db():
    global game_db
    with open(get_game_db_fname(), "wt") as fp:
        json.dump(game_db, fp)

def get_encoded_image(fname):
    with open(fname, "rb") as fp:
        return base64.standard_b64encode(fp.read()).decode()

###########
# DB UTIL #
###########

def get_current_image_num(app_id, image_type):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        ckey = f"current_{type_dict[image_type]}"
        if ckey in game_db["games"][app_id_str]:
            return int(game_db["games"][app_id_str][ckey])
    return -1

def get_max_image_num(app_id, image_type):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        if type_dict[image_type] in game_db["games"][app_id_str]:
            return len(game_db["games"][app_id_str][type_dict[image_type]])-1
    return -1

def delete_app_from_db(app_id):
    global game_db
    app_id_str = str(app_id)
    if app_id_str in game_db["games"]:
        del game_db["games"][app_id_str]
        save_game_db()

def get_ui_selection_list(app_id, image_type):
    global game_db
    app_id_str = str(app_id)
    selection_list = []
    if app_id_str in game_db["games"]:
        if type_dict[image_type] in game_db["games"][app_id_str]:
            for i in range(len(game_db["games"][app_id_str][type_dict[image_type]])):
                entry = game_db["games"][app_id_str][type_dict[image_type]][str(i)]
                type = entry["type"] if "type" in entry else "static"
                thumb_url = entry["thumb"] if "thumb" in entry else ""
                selection_list.append([thumb_url, type])
    return selection_list

def get_width_mult_config(app_id, image_type):
    wtype = f"{type_dict[image_type]}_width_mult"
    if wtype in get_config():
        return get_config()[wtype]
    else:
        return 5

################
# SGDB INTEROP #
################

def get_sgdb_id(app_name, app_id):
    logger.log(f"get_sgdb_id(): Searching for app {app_name} with ID {app_id}")
    app_id_str = str(app_id)
    sgdb_id = None
    headers = {"Authorization": f"Bearer {get_config()['api_key']}"}

    games_response = requests.get(f"https://www.steamgriddb.com/api/v2/games/steam/{app_id}", headers=headers)
    if games_response.status_code == 200:
        data = games_response.json()
        if data["success"]:
            sgdb_id = data["data"]["id"]
        else:
            logger.log("get_sgdb_id(): Unsuccessful - 'success' is false")
    else:
        logger.log(f"get_sgdb_id(): Unsuccessful - HTTP {games_response.status_code}")

    if sgdb_id is not None:
        logger.log(f"get_sgdb_id(): App found as {sgdb_id}")
        return sgdb_id

    fallback_enabled = get_config()["display_name_fallback"]
    if not fallback_enabled:
        logger.log("get_sgdb_id(): Fallback disabled")
        return None

    safe_name = urllib.parse.quote(str(app_name))
    search_response = requests.get(
        f"https://www.steamgriddb.com/api/v2/search/autocomplete/{safe_name}", headers=headers
    )
    if search_response.status_code == 200:
        data = search_response.json()
        if data["success"] and len(data["data"]) > 0:
            target = str(app_name).strip().lower()
            target_norm = re.sub(r"[^a-z0-9]+", "", target)
            target_digits = "".join(re.findall(r"\d+", target))

            best = None
            best_score = -10**9
            for item in data["data"]:
                cand_name = str(item.get("name", "")).strip().lower()
                cand_norm = re.sub(r"[^a-z0-9]+", "", cand_name)
                cand_digits = "".join(re.findall(r"\d+", cand_name))
                score = 0
                if cand_norm == target_norm and target_norm:
                    score += 1000
                if target and target in cand_name:
                    score += 100
                if cand_name and cand_name in target:
                    score += 25
                if target_digits:
                    if cand_digits == target_digits:
                        score += 200
                    else:
                        score -= 500
                # Prefer closer length match
                score -= abs(len(cand_norm) - len(target_norm))

                if score > best_score:
                    best_score = score
                    best = item

            if best:
                sgdb_id = best.get("id")
                logger.log(
                    f"get_sgdb_id(): Fallback selected '{best.get('name')}' (id={sgdb_id}, score={best_score})"
                )
        else:
            logger.log("get_sgdb_id(): Unsuccessful - 'success' is false or no data")
    else:
        logger.log(f"get_sgdb_id(): Unsuccessful - HTTP {search_response.status_code}")

    if sgdb_id is not None:
        logger.log(f"get_sgdb_id(): App found as {sgdb_id}")
        return sgdb_id

    return None

def get_cached_file(app_name, app_id, image_type, image_num, set_current):
    global game_db

    logger.log(f"get_cached_file(): Searching for type {image_type} for app {app_id} with index {image_num}")
    app_id_str = str(app_id)
    sgdb_id = None

    if app_id_str in game_db["overrides"]:
        sgdb_id = game_db["overrides"][app_id_str]
    else:
        sgdb_id = get_sgdb_id(app_name, app_id)
        if sgdb_id is None:
            logger.log("get_cached_file(): Cannot find GameID")
            return None
        else:
            game_db["overrides"][str(app_id)] = sgdb_id
            save_game_db()

    if app_id_str not in game_db["games"]:
        game_db["games"][app_id_str] = {}

    if type_dict[image_type] not in game_db["games"][app_id_str]:
        logger.log(f"get_cached_file(): No URLs cached for type {image_type} for app {app_id}")
        animated_url_list = []
        url_list = []
        thumb_list = []

        headers = {"Authorization": f"Bearer {get_config()['api_key']}"}
        query_param = {}
        if f"{type_dict[image_type]}_config" in get_config():
            query_param = get_config()[f"{type_dict[image_type]}_config"]
        # Steam appears to prefer smaller square icons; request 256x256 for icons (SGDBoop-compatible).
        if image_type == 4 and "dimensions" not in query_param:
            query_param["dimensions"] = "256x256"

        original_types = query_param["types"]
        query_param["types"] = "animated"
        fetch_image_urls(headers, image_type, query_param, sgdb_id, animated_url_list, None)
        query_param["types"] = original_types

        fetch_image_urls(headers, image_type, query_param, sgdb_id, url_list, thumb_list)

        prioritize_animated = get_config().get("prioritize_animated", False)
        combined_urls = []
        if prioritize_animated:
            combined_urls.extend(animated_url_list)
            combined_urls.extend([url for url in url_list if url not in animated_url_list])
        else:
            combined_urls = url_list

        final_url_list = {}
        for i, url in enumerate(combined_urls):
            type = "animated" if url in animated_url_list else "static"
            thumb_idx = url_list.index(url)
            final_url_list[str(i)] = {"url": url, "type": type, "thumb": thumb_list[thumb_idx]}

        if len(final_url_list) > 0:
            game_db["games"][app_id_str][type_dict[image_type]] = final_url_list
            save_game_db()
        else:
            logger.log("get_cached_file(): No URLs found")
            return None

    if image_num == -1 and set_current:
        ckey = f"current_{type_dict[image_type]}"
        game_db["games"][app_id_str][ckey] = image_num
        save_game_db()
        return None

    if image_num < 0 or image_num >= len(game_db["games"][app_id_str][type_dict[image_type]]):
        logger.log(f"get_cached_file(): Invalid index {image_num}")
        return None

    try:
        image_url = game_db["games"][app_id_str][type_dict[image_type]][str(image_num)]["url"]
    except:
        image_url = game_db["games"][app_id_str][type_dict[image_type]][image_num]
    logger.log(f"get_cached_file(): Image URL is {image_url}")

    ftype = "png"
    logger.log(f"get_cached_file(): Image filetype is {ftype}")
    # Name cached files with meaningful suffixes; icons use _icon to mirror Steam convention
    if image_type == 4:
        fname = os.path.join(get_cache_dir(), f"{app_id}_icon_{image_num}.{ftype}")
    elif image_type == 1:
        fname = os.path.join(get_cache_dir(), f"{app_id}_hero_{image_num}.{ftype}")
    elif image_type == 2:
        fname = os.path.join(get_cache_dir(), f"{app_id}_logo_{image_num}.{ftype}")
    elif image_type == 3:
        fname = os.path.join(get_cache_dir(), f"{app_id}_wide_{image_num}.{ftype}")
    else:
        fname = os.path.join(get_cache_dir(), f"{app_id}p_{image_num}.{ftype}")

    # If a legacy-named file exists (appid_imagetype_index.png), rename it to the new convention
    legacy_fname = os.path.join(get_cache_dir(), f"{app_id}_{image_type}_{image_num}.{ftype}")
    if not os.path.exists(fname) and os.path.exists(legacy_fname):
        try:
            os.rename(legacy_fname, fname)
            logger.log(f"Renamed legacy cache file {legacy_fname} -> {fname}")
        except Exception as e:
            logger.log(f"Failed to rename legacy cache file {legacy_fname} -> {fname}: {e}")

    def try_read_png_size(path):
        try:
            with open(path, "rb") as f:
                header = f.read(24)
            if len(header) < 24:
                return None
            if header[0:8] != b"\x89PNG\r\n\x1a\n":
                return None
            if header[12:16] != b"IHDR":
                return None
            import struct
            width = struct.unpack(">I", header[16:20])[0]
            height = struct.unpack(">I", header[20:24])[0]
            return (width, height)
        except Exception:
            return None

    # If we previously cached an oversized icon, purge it so we re-download at the desired size (e.g., 256x256).
    if image_type == 4 and os.path.exists(fname):
        size = try_read_png_size(fname)
        if size and (size[0] != size[1] or size[0] > 256):
            try:
                os.remove(fname)
                logger.log(f"Purged oversized cached icon {fname} ({size[0]}x{size[1]})")
            except Exception as e:
                logger.log(f"Failed to purge oversized cached icon {fname}: {e}")
    if not os.path.exists(fname):
        logger.log("get_cached_file(): Downloading...")
        with requests.get(image_url, stream=True) as r:
            with open(fname, "wb") as f:
                shutil.copyfileobj(r.raw, f)

    if set_current:
        ckey = f"current_{type_dict[image_type]}"
        game_db["games"][app_id_str][ckey] = image_num
        save_game_db()

    # For icons, also write into Steam's grid folder with the proper suffix
    if image_type == 4:
        write_icon_to_grid(app_id, fname, ftype)
        # Also copy any legacy plain grid file to the _icon name to cover Steam writes
        ensure_grid_icon_copy(app_id, ftype)

    logger.log(f"get_cached_file() -> {fname}")
    return f"{ftype};{get_encoded_image(fname)}"

def fetch_image_urls(headers, image_type, query_param, sgdb_id, url_list, thumb_list):
    page = 0
    while True:
        query_param["page"] = page
        query_string = "&".join(f"{k}={v}" for k, v in query_param.items())
        type_string = type_dict[image_type]
        if image_type == 3:
            type_string = "grids"
        url = f"https://www.steamgriddb.com/api/v2/{type_string}/game/{sgdb_id}?{query_string}"
        logger.log(f"HTTP GET: {url}")
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json()
            if data["success"] and len(data["data"]) > 0:
                for item in data["data"]:
                    url_list.append(item["url"])
                    if thumb_list is not None:
                        thumb_list.append(item["thumb"])
                if len(data["data"]) < 50:
                    break
                page += 1
            else:
                logger.log(f"get_cached_file(): Unsuccessful - 'success' is false or no data for url {response.url}")
                break
        else:
            logger.log(f"get_cached_file(): Unsuccessful - HTTP {response.status_code} for url {response.url}")
            break

##############
# INTERFACES #
##############

class Backend:
    @staticmethod
    def get_image(app_name, app_id, image_type, image_num, set_current, is_replace_collection = False):
        logger.log(f"get_image() called for app {app_name} with ID {app_id} and type {image_type} and index {image_num}")
        curr_image = get_current_image_num(app_id, image_type)
        cached_file = get_cached_file(app_name, app_id, image_type, image_num, set_current)

        if is_replace_collection:
            if (not get_config()["replace_custom_images"] and curr_image != -1) or app_id in get_config()["appids_excluded_from_replacement"]:
                cached_file = get_cached_file(app_name, app_id, image_type, curr_image, set_current)
            elif get_config()["prioritize_animated"]:
                try:
                    images = game_db["games"][str(app_id)][type_dict[image_type]]
                    for i, image in images.items():
                        if image["type"] == "animated":
                            cached_file = get_cached_file(app_name, app_id, image_type, int(i), set_current)
                            break
                except:
                    logger.log(f"get_image() -> No {type_dict[image_type]} found or old game_db for {app_id}: {app_name}")

        if cached_file is not None:
            logger.log("get_image() -> Image exists, returning encoded data")
            return cached_file
        else:
            logger.log("get_image() -> Image not found")
            return ""

    @staticmethod
    def get_current_index(app_id, image_type):
        logger.log(f"get_current_index() called for app {app_id} and type {image_type}")
        current_num = get_current_image_num(app_id, image_type)
        logger.log(f"get_current_index() -> {current_num}")
        return current_num

    @staticmethod
    def get_max_index(app_id, image_type):
        logger.log(f"get_max_index() called for app {app_id} and type {image_type}")
        max_num = get_max_image_num(app_id, image_type)
        logger.log(f"get_max_index() -> {max_num}")
        return max_num

    @staticmethod
    def purge_cache(app_id):
        logger.log(f"purge_cache() called for app {app_id}")
        app_id_str = str(app_id)
        try:
            if app_id_str in game_db.get("overrides", {}):
                del game_db["overrides"][app_id_str]
                save_game_db()
        except Exception as e:
            logger.log(f"purge_cache(): failed removing override for {app_id}: {e}")
        delete_app_from_db(app_id)
        patterns = [
            os.path.join(get_cache_dir(), f"{app_id}_*"),
            os.path.join(get_cache_dir(), f"{app_id}p_*"),
        ]
        for pat in patterns:
            for f in glob.glob(pat):
                try:
                    os.remove(f)
                except Exception:
                    pass
        return True

    @staticmethod
    def get_steamgriddb_id(app_id: int) -> int:
        try:
            app_id_str = str(app_id)
            if app_id_str in game_db["overrides"]:
                return game_db["overrides"][app_id_str]
            return None
        except:
            return None

    @staticmethod
    def get_thumb_list(app_id, image_type):
        logger.log(f"get_thumb_list() called for app {app_id} and type {image_type}")
        return json.dumps(get_ui_selection_list(app_id, image_type))

    @staticmethod
    def get_width_mult(app_id, image_type):
        logger.log(f"get_width_mult() called for app {app_id} and type {image_type}")
        width_mult = get_width_mult_config(app_id, image_type)
        logger.log(f"get_width_mult() -> {width_mult}")
        return width_mult

    @staticmethod
    def get_expand_headers_value():
        expand_headers = ""
        if "expand_headers" in get_config():
            expand_headers = get_config()["expand_headers"]
        logger.log(f"get_expand_headers_value() -> {expand_headers}")
        return expand_headers

    @staticmethod
    def get_app_page_button():
        app_page_button = True
        if "app_page_button" in get_config():
            app_page_button = get_config()["app_page_button"]
        logger.log(f"get_app_page_button() -> {app_page_button}")
        return app_page_button

    @staticmethod
    def get_stagger_main_load():
        stagger_main_load = 0
        if "stagger_main_load" in get_config():
            stagger_main_load = get_config()["stagger_main_load"]
        logger.log(f"get_stagger_main_load() -> {stagger_main_load}")
        return stagger_main_load

    @staticmethod
    def get_stagger_page_load():
        stagger_page_load = 0
        if "stagger_page_load" in get_config():
            stagger_page_load = get_config()["stagger_page_load"]
        logger.log(f"get_stagger_page_load() -> {stagger_page_load}")
        return stagger_page_load

class Plugin:
    def _front_end_loaded(self):
        logger.log("Frontend loaded")

    def _load(self):
        logger.log(f"Plugin base dir: {PLUGIN_BASE_DIR}")

        cache_dir = get_cache_dir()
        if not os.path.exists(cache_dir):
            logger.log("Creating cache dir...")
            os.mkdir(cache_dir)
        logger.log(f"Cache dir: {cache_dir}")

        load_game_db()
        logger.log("Database loaded")

        get_config()
        logger.log("Backend loaded")
        Millennium.ready()

    def _unload(self):
        save_game_db()
        logger.log("Database saved")
        logger.log("Unloading")
