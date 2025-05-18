import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton } from "@steambrew/client";
import { render } from "react-dom";

// Backend functions
const get_image = callable<[{ app_name: string, app_id: number, image_type: number, image_num: number, set_current: boolean, is_replace_collection?: boolean }], string>('Backend.get_image');
const get_current_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_current_index');
const get_max_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_max_index');
const get_steamgriddb_id = callable<[{ app_id: number }], number>('Backend.get_steamgriddb_id');
const purge_cache = callable<[{ app_id: number }], boolean>('Backend.purge_cache');

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];

const WaitForElementList = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))];

async function getSteamGridDBId(appId: number): Promise<number | undefined> {
    try {
        return await get_steamgriddb_id({ app_id: appId });
    } catch (e) {
        console.error("[steam-easygrid 2] Failed to get SteamGridDB ID:", e);
        return undefined;
    }
}

async function OnPopupCreation(popup: any) {
    if (popup.m_strName === "SP Desktop_uid0") {
        var mwbm = undefined;
        while (!mwbm) {
            console.log("[steam-easygrid 2] Waiting for MainWindowBrowserManager");
            try {
                mwbm = MainWindowBrowserManager;
            } catch {
                await sleep(100);
            }
        }

        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
                const oldGridButton = headerDiv.querySelector('button.easygrid-button');
                if (!oldGridButton) {
                    const gridButton = popup.m_popup.document.createElement("div");
                    render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>, gridButton);
                    headerDiv.insertBefore(gridButton, headerDiv.firstChild.nextSibling.nextSibling);
                    
                    gridButton.addEventListener("click", async () => {
                        const extraMenuItems = [];
                        for (let i = 0; i < collectionStore.userCollections.length; i++) {
                            const collId = collectionStore.userCollections[i].m_strId;
                            const collName = collectionStore.userCollections[i].m_strName;
                            extraMenuItems.push(<MenuItem onClick={async () => {
                                const currentColl = collectionStore.GetCollection(collId);
                                for (let j = 0; j < currentColl.allApps.length; j++) {
                                    gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                    const newImage = await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: 0, set_current: true, is_replace_collection: true });
                                    if (newImage !== "") {
                                        const newImageParts = newImage.split(";", 2);
                                        SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImageParts[1], newImageParts[0], 0);
                                    }
                                }
                                gridButton.firstChild.innerHTML = "Done!";
                                console.log("[steam-easygrid 2] Grids replaced for", collId);
                            }}> Replace grids of {collName} </MenuItem>);
                            extraMenuItems.push(<MenuItem onClick={async () => {
                                const currentColl = collectionStore.GetCollection(collId);
                                for (let j = 0; j < currentColl.allApps.length; j++) {
                                    gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                    SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                                    await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true });
                                }
                                gridButton.firstChild.innerHTML = "Done!";
                                console.log("[steam-easygrid 2] Grids cleared for", collId);
                            }}> Reset grids of {collName} </MenuItem>);
                        }

                        showContextMenu(
                            <Menu label="EasyGrid Options">
                                {extraMenuItems}
                            </Menu>,
                            gridButton,
                            { bForcePopup: true }
                        );
                    });
                }
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                const collOptionsDiv = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
                const oldGridButton = collOptionsDiv.querySelector('button.easygrid-button');
                if (!oldGridButton) {
                    const gridButton = popup.m_popup.document.createElement("div");
                    render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>, gridButton);
                    collOptionsDiv.insertBefore(gridButton, collOptionsDiv.firstChild.nextSibling);

                    gridButton.addEventListener("click", async () => {
                        showContextMenu(
                            <Menu label="EasyGrid Options">
                                <MenuItem onClick={async () => {
                                    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                    for (let j = 0; j < currentColl.allApps.length; j++) {
                                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                        const newImage = await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: 0, set_current: true, is_replace_collection: true });
                                        if (newImage !== "") {
                                            const newImageParts = newImage.split(";", 2);
                                            SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImageParts[1], newImageParts[0], 0);
                                        }
                                    }
                                    gridButton.firstChild.innerHTML = "Done!";
                                    console.log("[steam-easygrid 2] Grids replaced for", uiStore.currentGameListSelection.strCollectionId);
                                }}> Replace grids </MenuItem>
                                <MenuItem onClick={async () => {
                                    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                    for (let j = 0; j < currentColl.allApps.length; j++) {
                                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                        SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                                        await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true });
                                    }
                                    gridButton.firstChild.innerHTML = "Done!";
                                    console.log("[steam-easygrid 2] Grids cleared for", uiStore.currentGameListSelection.strCollectionId);
                                }}> Reset grids </MenuItem>
                            </Menu>,
                            gridButton,
                            { bForcePopup: true }
                        );
                    });
                }
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
                if (!topCapsuleDiv.classList.contains("easygrid-header")) {
                    topCapsuleDiv.addEventListener("dblclick", async () => {
                        const oldSearchingDiv = topCapsuleDiv.querySelector('div.easygrid-panel');
                        if (!oldSearchingDiv) {
                            const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                            const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);

                            await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 1, image_num: -1, set_current: false });
                            await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 2, image_num: -1, set_current: false });
                            await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: -1, set_current: false });
                            const currentHeroNum = await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 1 });
                            const currentLogoNum = await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 2 });
                            const currentGridNum = await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 0 });
                            const maxHeroNum = await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 1 });
                            const maxLogoNum = await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 2 });
                            const maxGridNum = await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 0 });

                            const searchingDiv = document.createElement("div");
                            const steamGridDBId = await getSteamGridDBId(uiStore.currentGameListSelection.nAppId);
                            searchingDiv.className = "easygrid-panel";
                            searchingDiv.style.cssText = "z-index: 999;";
                            render(<>
                                       <br />
                                       <br />
                                       <br />
                                       <a href={`https://www.steamgriddb.com/game/${steamGridDBId}`} style={{color: "#f87171"}} target="_blank">SteamGridDB</a><br />
                                       <div style={{display: "grid", gridTemplateColumns: "auto 1fr", gap: "0px", alignItems: "center"}}>
                                           <label for="hero_num">Hero:</label>
                                           <div style={{display: "flex", gap: "0px"}}>
                                               <input id="hero_num" type="number" min="-1" max={maxHeroNum} defaultValue={currentHeroNum} style={{flex: "1"}} /> (Max: {maxHeroNum}) <input id="hero_r" type="button" value="R" />
                                           </div>
                                           <label for="logo_num">Logo:</label>
                                           <div style={{display: "flex", gap: "0px"}}>
                                               <input id="logo_num" type="number" min="-1" max={maxLogoNum} defaultValue={currentLogoNum} style={{flex: "1"}} /> (Max: {maxLogoNum}) <input id="logo_r" type="button" value="R" />
                                           </div>
                                           <label for="grid_num">Grid:</label>
                                           <div style={{display: "flex", gap: "0px"}}>
                                               <input id="grid_num" type="number" min="-1" max={maxGridNum} defaultValue={currentGridNum} style={{flex: "1"}} /> (Max: {maxGridNum}) <input id="grid_r" type="button" value="R" />
                                           </div>
                                       </div>
                                       <br />
                                       <input id="purge_btn" type="button" value="Purge Cache" style={{width: "100%"}} /><br />
                                       <input id="close_panel" type="button" value="Close" style={{width: "100%"}} /><br />
                                       <img id="grid_img" width="210" />
                                   </>, searchingDiv);
                            topCapsuleDiv.appendChild(searchingDiv);

                            searchingDiv.querySelector("input#hero_num").addEventListener("change", async (event) => {
                                const targetNum = Number(event.target.value);
                                console.log("[steam-easygrid 2] Header selected:", targetNum);
                                if (targetNum === -1) {
                                    SteamClient.Apps.ClearCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, 1);
                                    await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 1, image_num: -1, set_current: true });
                                    console.log("[steam-easygrid 2] Header reset for", uiStore.currentGameListSelection.nAppId);
                                } else {
                                    const newImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 1, image_num: targetNum, set_current: true });
                                    if (newImage !== "") {
                                        const newImageParts = newImage.split(";", 2);
                                        SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImageParts[1], newImageParts[0], 1);
                                        console.log("[steam-easygrid 2] Header replaced for", uiStore.currentGameListSelection.nAppId);
                                    }
                                }
                            });
                            searchingDiv.querySelector("input#logo_num").addEventListener("change", async (event) => {
                                const targetNum = Number(event.target.value);
                                console.log("[steam-easygrid 2] Logo selected:", targetNum);
                                if (targetNum === -1) {
                                    SteamClient.Apps.ClearCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, 2);
                                    await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 2, image_num: -1, set_current: true });
                                    console.log("[steam-easygrid 2] Logo reset for", uiStore.currentGameListSelection.nAppId);
                                } else {
                                    const newImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 2, image_num: targetNum, set_current: true });
                                    if (newImage !== "") {
                                        const newImageParts = newImage.split(";", 2);
                                        SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImageParts[1], newImageParts[0], 2);
                                        console.log("[steam-easygrid 2] Logo replaced for", uiStore.currentGameListSelection.nAppId);
                                    }
                                }
                            });
                            searchingDiv.querySelector("input#grid_num").addEventListener("change", async (event) => {
                                const targetNum = Number(event.target.value);
                                console.log("[steam-easygrid 2] Grid selected:", targetNum);
                                if (targetNum === -1) {
                                    SteamClient.Apps.ClearCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, 0);
                                    await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: -1, set_current: true });
                                    searchingDiv.querySelector("img#grid_img").src = "";
                                    console.log("[steam-easygrid 2] Grid reset for", uiStore.currentGameListSelection.nAppId);
                                } else {
                                    const newImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: targetNum, set_current: true });
                                    if (newImage !== "") {
                                        const newImageParts = newImage.split(";", 2);
                                        SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImageParts[1], newImageParts[0], 0);
                                        searchingDiv.querySelector("img#grid_img").src = `data:image/${newImageParts[0]};base64,${newImageParts[1]}`;
                                        console.log("[steam-easygrid 2] Grid replaced for", uiStore.currentGameListSelection.nAppId);
                                    }
                                }
                            });
                            searchingDiv.querySelector("input#hero_r").addEventListener("click", async () => {
                                searchingDiv.querySelector("input#hero_num").value = -1;
                                searchingDiv.querySelector("input#hero_num").dispatchEvent(new Event('change'));
                            });
                            searchingDiv.querySelector("input#logo_r").addEventListener("click", async () => {
                                searchingDiv.querySelector("input#logo_num").value = -1;
                                searchingDiv.querySelector("input#logo_num").dispatchEvent(new Event('change'));
                            });
                            searchingDiv.querySelector("input#grid_r").addEventListener("click", async () => {
                                searchingDiv.querySelector("input#grid_num").value = -1;
                                searchingDiv.querySelector("input#grid_num").dispatchEvent(new Event('change'));
                            });
                            searchingDiv.querySelector("input#purge_btn").addEventListener("click", async () => {
                                await purge_cache({ app_id: uiStore.currentGameListSelection.nAppId });
                                searchingDiv.remove();
                            });
                            searchingDiv.querySelector("input#close_panel").addEventListener("click", async () => {
                                searchingDiv.remove();
                            });

                            if (currentGridNum !== -1) {
                                const currentImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: currentGridNum, set_current: false });
                                if (currentImage !== "") {
                                    const currentImageParts = currentImage.split(";", 2);
                                    searchingDiv.querySelector("img#grid_img").src = `data:image/${currentImageParts[0]};base64,${currentImageParts[1]}`;
                                }
                            }
                        }
                    });
                    topCapsuleDiv.classList.add("easygrid-header");
                }
            }
        });
    }
}

export default async function PluginMain() {
    console.log("[steam-easygrid 2] frontend startup");

    const doc = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}
