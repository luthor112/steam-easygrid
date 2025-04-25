import { callable, findClassModule, findModule, Millennium, Menu, MenuItem, showContextMenu } from "@steambrew/client";

// Backend functions
const get_filetype = callable<[{}], string>('Backend.get_filetype');
const get_fallback_enabled = callable<[{}], boolean>('Backend.get_fallback_enabled');
const get_image = callable<[{ app_id: number, image_type: number }], string>('Backend.get_image');
const get_image_appname = callable<[{ app_name: string, app_id: number, image_type: number }], string>('Backend.get_image_appname');

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];

const WaitForElementList = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))];

async function OnPopupCreation(popup: any) {
    if (popup.m_strName === "SP Desktop_uid0") {
        const mainTabs = await WaitForElementList(`div.${findModule(e => e.SuperNavMenu).SuperNavMenu}`, popup.m_popup.document);
        const libraryButton = mainTabs.find(el => el.textContent === findModule(e => e.MainTabsLibrary).MainTabsLibrary);
        const gameList = await WaitForElement('div.ReactVirtualized__Grid__innerScrollContainer', popup.m_popup.document);

        libraryButton.addEventListener("click", async () => {
            setTimeout(async () => {
                const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
                const oldGridButton = headerDiv.querySelector('div.easygrid-button');
                if (!oldGridButton) {
                    const gridButton = popup.m_popup.document.createElement("div");
                    gridButton.className = `${findModule(e => e.MenuButtonContainer).MenuButtonContainer} easygrid-button`;
                    gridButton.innerHTML = `<div class="${findModule(e => e.GameInfoButton).MenuButton} Focusable" tabindex="0" role="button">+</div>`;
                    headerDiv.insertBefore(gridButton, headerDiv.firstChild.nextSibling.nextSibling);
                    
                    gridButton.addEventListener("click", async () => {
                        const extraMenuItems = [];
                        for (let i = 0; i < collectionStore.userCollections.length; i++) {
                            const collId = collectionStore.userCollections[i].m_strId;
                            const collName = collectionStore.userCollections[i].m_strName;
                            extraMenuItems.push(<MenuItem onClick={async () => {
                                const currentColl = collectionStore.GetCollection(collId);
                                const filetype = await get_filetype({});
                                const fallbackEnabled = await get_fallback_enabled({});
                                for (let j = 0; j < currentColl.allApps.length; j++) {
                                    gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                                    const newImage = await get_image({ app_id: currentColl.allApps[j].appid, image_type: 0 });
                                    if (newImage !== "") {
                                        SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImage, filetype, 0);
                                    } else if (fallbackEnabled) {
                                        const imageByName = await get_image_appname({ app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0 });
                                        if (imageByName !== "") {
                                            SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, imageByName, filetype, 0);
                                        }
                                    }
                                }
                                gridButton.firstChild.innerHTML = "Done!";
                                console.log("[steam-easygrid] Grids replaced for", collId);
                            }}> Replace grids of {collName} </MenuItem>);
                            extraMenuItems.push(<MenuItem onClick={async () => {
                                gridButton.firstChild.innerHTML = "Working...";
                                const currentColl = collectionStore.GetCollection(collId);
                                for (let j = 0; j < currentColl.allApps.length; j++) {
                                    SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                                }
                                gridButton.firstChild.innerHTML = "Done!";
                                console.log("[steam-easygrid] Grids cleared for", collId);
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
            }, 1000);
        });

        gameList.addEventListener("click", async () => {
            setTimeout(async () => {
                const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
                if (!topCapsuleDiv.classList.contains("easygrid-header")) {
                    topCapsuleDiv.addEventListener("dblclick", async () => {
                        const filetype = await get_filetype({});
                        const fallbackEnabled = await get_fallback_enabled({});

                        for (let imgType = 1; imgType < 3; imgType++) {
                            const newImage = await get_image({ app_id: uiStore.currentGameListSelection.nAppId, image_type: imgType });
                            if (newImage !== "") {
                                SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImage, filetype, imgType);
                            } else if (fallbackEnabled) {
                                const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                                const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);
                                if (currentApp) {
                                    const imageByName = await get_image_appname({ app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: imgType });
                                    if (imageByName !== "") {
                                        SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, imageByName, filetype, imgType);
                                    }
                                }
                            }
                        }
                        console.log("[steam-easygrid] Header and logo replaced for", uiStore.currentGameListSelection.nAppId);
                    });
                    topCapsuleDiv.classList.add("easygrid-header");
                }
            }, 1000);
        });
    }
}

export default async function PluginMain() {
    console.log("[steam-easygrid] frontend startup");

    const doc = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}
