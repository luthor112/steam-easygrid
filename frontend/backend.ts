import { callable } from "@steambrew/client";

export const call_api_backend = callable<[{ a_bearer: string, b_endpoint: string }], string>('call_api_backend');
export const download_image = callable<[{ a_img_url: string }], number>('download_image');
export const get_image_chunk = callable<[{ a_img_url: string, b_chunk_index: number }], string>('get_image_chunk');
export const cleanup_image = callable<[{ a_img_url: string }], void>('cleanup_image');
export const log_frontend = callable<[{ msg: string }], void>('log_frontend');
export const set_icon_from_url = callable<[{ a_appid: number, b_img_url: string, c_extension: string }], boolean>('set_icon_from_url');
export const clear_icon = callable<[{ a_appid: number }], boolean>('clear_icon');
