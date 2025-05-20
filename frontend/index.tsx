import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, showModal, ModalRoot } from "@steambrew/client";
import { render } from "react-dom";
import React, { useState, useEffect } from "react";

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
        console.error("[steam-easygrid 3] Failed to get SteamGridDB ID:", e);
        return undefined;
    }
}

async function OnPopupCreation(popup: any) {
    if (popup.m_strName === "SP Desktop_uid0") {
        var mwbm = undefined;
        while (!mwbm) {
            console.log("[steam-easygrid 3] Waiting for MainWindowBrowserManager");
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
                                console.log("[steam-easygrid 3] Grids replaced for", collId);
                            }}> Replace grids of {collName} </MenuItem>);
                            extraMenuItems.push(<MenuItem onClick={async () => {
                                const currentColl = collectionStore.GetCollection(collId);
                                for (let j = 0; j < currentColl.allApps.length; j++) {
                                    gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                    SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                                    await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true });
                                }
                                gridButton.firstChild.innerHTML = "Done!";
                                console.log("[steam-easygrid 3] Grids cleared for", collId);
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
                                    console.log("[steam-easygrid 3] Grids replaced for", uiStore.currentGameListSelection.strCollectionId);
                                }}> Replace grids </MenuItem>
                                <MenuItem onClick={async () => {
                                    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                    for (let j = 0; j < currentColl.allApps.length; j++) {
                                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                        SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                                        await get_image({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true });
                                    }
                                    gridButton.firstChild.innerHTML = "Done!";
                                    console.log("[steam-easygrid 3] Grids cleared for", uiStore.currentGameListSelection.strCollectionId);
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
                        const EasyGridComponent: React.FC = () => {
                            const [displayName, setDisplayName] = useState<string>("");
                            const [currentHeroNum, setCurrentHeroNum] = useState<number>(-1);
                            const [currentLogoNum, setCurrentLogoNum] = useState<number>(-1);
                            const [currentGridNum, setCurrentGridNum] = useState<number>(-1);
                            const [maxHeroNum, setMaxHeroNum] = useState<number>(-1);
                            const [maxLogoNum, setMaxLogoNum] = useState<number>(-1);
                            const [maxGridNum, setMaxGridNum] = useState<number>(-1);
                            const [gridImageData, setGridImageData] = useState<string>("");
                            
                            const GetCurrentSettings = async () => {
                                const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);
                                setDisplayName(currentApp.display_name);
                                
                                await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 1, image_num: -1, set_current: false });
                                await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 2, image_num: -1, set_current: false });
                                await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: -1, set_current: false });
                                
                                setCurrentHeroNum(await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 1 }));
                                setCurrentLogoNum(await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 2 }));
                                const cgn = await get_current_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 0 });
                                setCurrentGridNum(cgn);
                                
                                setMaxHeroNum(await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 1 }));
                                setMaxLogoNum(await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 2 }));
                                setMaxGridNum(await get_max_index({ app_id: uiStore.currentGameListSelection.nAppId, image_type: 0 }));
                                
                                if (cgn !== -1) {
                                    const currentImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: 0, image_num: cgn, set_current: false });
                                    if (currentImage !== "") {
                                        const currentImageParts = currentImage.split(";", 2);
                                        setGridImageData(`data:image/${currentImageParts[0]};base64,${currentImageParts[1]}`);
                                    }
                                }
                            };
                            
                            const SetCustomImage = async (event) => {
                                const targetType = Number(event.target.dataset.imagetype);
                                const targetNum = Number(event.target.value);
                                console.log(`[steam-easygrid 3] ${event.target.id} selected:`, targetNum);

                                switch(targetType) {
                                    case 1:
                                        setCurrentHeroNum(targetNum);
                                        break;
                                    case 2:
                                        setCurrentLogoNum(targetNum);
                                        break;
                                    case 0:
                                        setCurrentGridNum(targetNum);
                                        break;
                                }

                                const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);

                                if (targetNum === -1) {
                                    SteamClient.Apps.ClearCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, targetType);
                                    await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: targetType, image_num: -1, set_current: true });
                                    if (targetType === 0) {
                                        setGridImageData("");
                                    }
                                    console.log(`[steam-easygrid 3] ${event.target.id} reset for`, uiStore.currentGameListSelection.nAppId);
                                } else {
                                    const newImage = await get_image({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: targetType, image_num: targetNum, set_current: true });
                                    if (newImage !== "") {
                                        const newImageParts = newImage.split(";", 2);
                                        SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImageParts[1], newImageParts[0], targetType);
                                        if (targetType === 0) {
                                            setGridImageData(`data:image/${newImageParts[0]};base64,${newImageParts[1]}`);
                                        }
                                        console.log(`[steam-easygrid 3] ${event.target.id} replaced for`, uiStore.currentGameListSelection.nAppId);
                                    }
                                }
                            };
                            
                            const PurgeImageCache = async () => {
                                console.log("[steam-easygrid 3] Purging cache and reloading...");
                                await purge_cache({ app_id: uiStore.currentGameListSelection.nAppId });
                                GetCurrentSettings();
                            };
                            
                            useEffect(() => {
                                GetCurrentSettings();
                            }, []);
                            
                            return (
                                <ModalRoot closeModal={() => {}}>
                                   <b>SteamGridDB for {displayName}</b><br />
                                   <div style={{display: "grid", gridTemplateColumns: "auto 1fr", gap: "0px", alignItems: "center"}}>
                                       <label for="hero_num">Hero:</label>
                                       <div style={{display: "flex", gap: "0px"}}>
                                           <input id="hero_num" type="number" min="-1" max={maxHeroNum} value={currentHeroNum} style={{flex: "1"}} data-imagetype="1" onChange={SetCustomImage} /> (Max: {maxHeroNum})
                                       </div>
                                       <label for="logo_num">Logo:</label>
                                       <div style={{display: "flex", gap: "0px"}}>
                                           <input id="logo_num" type="number" min="-1" max={maxLogoNum} value={currentLogoNum} style={{flex: "1"}} data-imagetype="2" onChange={SetCustomImage} /> (Max: {maxLogoNum})
                                       </div>
                                       <label for="grid_num">Grid:</label>
                                       <div style={{display: "flex", gap: "0px"}}>
                                           <input id="grid_num" type="number" min="-1" max={maxGridNum} value={currentGridNum} style={{flex: "1"}} data-imagetype="0" onChange={SetCustomImage} /> (Max: {maxGridNum})
                                       </div>
                                   </div>
                                   <br />
                                   <input id="purge_btn" type="button" value="Purge Cache" style={{width: "100%"}} onClick={PurgeImageCache} /><br />
                                   <img id="grid_img" width="210" src={gridImageData} />
                                </ModalRoot>
                            );
                        };
                        showModal(<EasyGridComponent />, popup.m_popup.window, { strTitle: "EasyGrid", bHideMainWindowForPopouts: false, bForcePopOut: true, popupHeight: 650, popupWidth: 350 });
                    });
                    topCapsuleDiv.classList.add("easygrid-header");
                }
            }
        });
    }
}

export default async function PluginMain() {
    console.log("[steam-easygrid 3] frontend startup");

    const doc = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}
