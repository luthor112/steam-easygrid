import { callable } from "@steambrew/client";

export const call_api_backend = callable<[{ a_bearer: string, b_endpoint: string }], string>('call_api_backend');
export const download_image = callable<[{ a_img_url: string }], number>('download_image');
export const get_image_chunk = callable<[{ a_img_url: string, b_chunk_index: number }], string>('get_image_chunk');
export const cleanup_image = callable<[{ a_img_url: string }], void>('cleanup_image');
export const log_frontend = callable<[{ msg: string }], void>('log_frontend');
export const save_store = callable<[{ a_key: string, b_value: string }], boolean>('save_store');
export const load_store = callable<[{ a_key: string }], string>('load_store');
export const set_icon_from_url = callable<[{ a_appid: number, b_img_url: string, c_extension: string }], string>('set_icon_from_url');
export const clear_icon = callable<[{ a_appid: number }], boolean>('clear_icon');
export const get_icon_path = callable<[{ a_appid: number }], string>('get_icon_path');
export const create_backup = callable<[{ a_root: string, b_keep: number, c_preset_name: string }], string>('create_backup');
export const delete_preset = callable<[{ a_path: string }], string>('delete_preset');
export const list_backups = callable<[{ a_path: string }], string>('list_backups');
export const restore_backup = callable<[{ a_backup_path: string, b_safety_root: string, c_keep: number, d_backup_first: number }], string>('restore_backup');
export const get_missing_images = callable<[{ a_appid: number }], string>('get_missing_images');
