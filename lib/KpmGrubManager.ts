import { window, QuickPickOptions } from "vscode";
import { showTacoTimeStatus, launchWebUrl } from "./Util";
import { getStatusBarItem, handleKpmClickedEvent } from "../extension";
import { isResponseOk } from "./HttpClient";
import { NOT_NOW_LABEL, YES_LABEL, OK_LABEL } from "./Constants";

let tacoTimeMap = {
    count: 0,
    activated: false
};

// 11am
const lunchHour = 11;
// 5pm
const dinnerHour = 17;
// past 30 minutes after the hour
const minutesOfHour = 30;
// max number of tacos displayed :)
const maxTacos = 15;

let grubWindow = null;

export function showTacoTime() {
    if (getStatusBarItem().command === "extension.orderGrubCommand") {
        return;
    }
    renderTacoTimeMessage(1);
}

function renderTacoTimeMessage(count) {
    count = count === undefined || count === null ? 1 : count;

    let tacos = "";
    for (let i = 0; i < count; i++) {
        tacos += "🌮 ";
    }

    let d = new Date();
    let hourOfDay = d.getHours();

    let tacoMsg = "Software " + tacos;

    showTacoTimeStatus(tacoMsg, "Is It Taco Time?");
    if (count === 3) {
        count = 1;
    } else {
        count++;
    }

    if (hourOfDay === lunchHour) {
        if (tacoTimeMap.count >= maxTacos) {
            showTacoTimeStatus("Software 🌮", "Is it taco time?");
            return;
        }
        tacoTimeMap.count += 1;
    } else {
        if (tacoTimeMap.count >= maxTacos) {
            showTacoTimeStatus("Software 🌮", "Is it taco time?");
            return;
        }
        tacoTimeMap.count += 1;
    }

    setTimeout(() => {
        renderTacoTimeMessage(count);
    }, 2000);
}

export function fetchTacoChoices() {
    if (tacoTimeMap.activated) {
        showQuickPick();
    } else {
        tacoTimeMap.count = maxTacos;
        tacoTimeMap.activated = true;
        if (!grubWindow) {
            /**
         * Grubhub, Doordash, UberEats
         * others we can show..
            Postmates, Delivery.com, Yelp Eat 24, Foodler
         */
            grubWindow = window
                .showInformationMessage(
                    "Would you like to order tacos now?",
                    ...[NOT_NOW_LABEL, YES_LABEL]
                )
                .then(selection => {
                    grubWindow = null;
                    if (selection === YES_LABEL) {
                        // open the input options box
                        showQuickPick();
                    }
                });
        }
    }
}

export function isTacoTime() {
    let d = new Date();

    let hour = d.getHours();
    let minutes = d.getMinutes();
    // 0 = sun, 6 = sat
    let day = d.getDay();

    let isWeekday = day >= 0 && day <= 5 ? true : false;
    let isLunchOrDinner =
        hour === lunchHour || hour === dinnerHour ? true : false;
    let isPastMinutesThreshold = minutes >= minutesOfHour ? true : false;

    // as long as it's a weekday and the hour is 11 or 5 and
    // it's past 30 minutes after the hour it's taco time
    if (isWeekday && isLunchOrDinner && isPastMinutesThreshold) {
        return true;
    } else {
        // clear the map altogether
        resetTacoTimeMap();
    }
    return false;
}

export function showQuickPick() {
    // The code you place here will be executed every time your command is executed
    let items = [
        {
            id: 0,
            description:
                "Get your favorite tacos delivered fast to your door with Doordash. No Minimum Order Size.",
            detail: "⭐⭐⭐⭐",
            label: "Doordash"
        },
        {
            id: 1,
            description:
                "Taco delivery, and much more, near you from Grubhub. Browse, Select, & Submit Your Order.",
            detail: "⭐⭐⭐⭐",
            label: "Grubhub"
        },
        {
            id: 2,
            description:
                "Get tacos deliverd at Uber Speed. Food Delivery by Uber",
            detail: "⭐⭐⭐⭐",
            label: "UberEats"
        },
        {
            id: 3,
            description:
                "Hungry for taco delivery? Order Eat24 today. Delivery menus, ratings and reviews, coupons, and more",
            detail: "⭐⭐⭐⭐",
            label: "Eat24"
        },
        {
            id: 4,
            description: "Go to software.com",
            detail: "View your KPM activity",
            label: "Software.com"
        }
    ];
    let options: QuickPickOptions = {
        onDidSelectItem: item => {
            window.setStatusBarMessage(item["label"]);
        },
        matchOnDescription: false,
        matchOnDetail: false,
        placeHolder: "Doordash"
    };
    window.showQuickPick(items, options).then(item => {
        let id = item.id;
        let weburl = "";
        if (id === 0) {
            weburl = "https://www.doordash.com/?query=tacos";
        } else if (id === 1) {
            weburl =
                "https://www.grubhub.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&latitude=37.41455459&longitude=-122.1899643&facet=open_now%3Atrue&variationId=otter&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true";
        } else if (id === 2) {
            weburl = "https://www.ubereats.com/en-US/search/?q=Tacos";
        } else if (id === 3) {
            weburl =
                "https://www.eat24.com/search?orderMethod=delivery&locationMode=DELIVERY&facetSet=umamiV2&pageSize=20&hideHateos=true&searchMetrics=true&queryText=tacos&facet=open_now%3Atrue&sortSetId=umamiV2&sponsoredSize=3&countOmittingTimes=true";
        }

        if (id === 4) {
            // it's the software dashboard selection
            handleKpmClickedEvent();
        } else {
            // it's a food order app item selection
            launchWebUrl(weburl);
        }
    });
}

function resetTacoTimeMap() {
    tacoTimeMap = {
        count: 0,
        activated: false
    };
}
