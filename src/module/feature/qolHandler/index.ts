import { MODULENAME } from "../../xdy-pf2e-workbench";
import { isActuallyDamageRoll, nth } from "../../utils";
import { ChatMessageDataPF2e } from "@module/chat-message/data";
import { ChatMessagePF2e } from "@module/chat-message";
import { SpellPF2e } from "@item";

export function chatCardDescriptionCollapse(html: JQuery) {
    // const eye = ' <i style="font-size: small" class="fa-solid fa-eye-slash">';
    if (game.settings.get(MODULENAME, "autoCollapseItemChatCardContent") === "collapsedDefault") {
        html.find(".card-content").hide();
        // $(html)
        //     .find("h3")
        //     .html($(html).find("h3").html() + eye);
    }
    html.on("click", "h3", (event: JQuery.ClickEvent) => {
        const content = event.currentTarget.closest(".chat-message")?.querySelector(".card-content");
        if (content && content.style) {
            event.preventDefault();
            content.style.display = content.style.display === "none" ? "block" : "none";
            if (content.style.display === "none") {
                html.find(".card-content").hide();
                // $(event.currentTarget).html($(event.currentTarget).html() + eye);
            } else {
                // if ($(event.currentTarget).html().includes(eye)) {
                //     $(event.currentTarget).html($(event.currentTarget).html().split(eye)[0]);
                // }
            }
        }
    });
}

export function damageCardExpand(message: ChatMessage, html: JQuery) {
    const expandDmg = <string>game.settings.get(MODULENAME, "autoExpandDamageRolls");
    if (expandDmg === "expandedAll") {
        html.find(".dice-tooltip").css("display", "block");
    }

    if (expandDmg.startsWith("expandedNew")) {
        if (
            game.messages.contents
                .filter(isActuallyDamageRoll)
                .slice(-Math.min(expandDmg.endsWith("est") ? 1 : 3, game.messages.size))
                .filter((m) => m.id === message.id).length > 0
        ) {
            html.find(".dice-tooltip").css("display", "block");
        }
    }
}

export function addGmRKButtonToNpc($html: JQuery, sheet: ActorSheet) {
    $html.find(".recall-knowledge").each((_i, e) => {
        const token = sheet.token;
        if (token) {
            $(e)
                .find(".section-body")
                .each((_i, e) => {
                    const $e = $(e);
                    if ($e.find(".identification-skills").length === 0) {
                        return;
                    }
                    for (const s of $e.find("ul").text().trim().split("\n")) {
                        const skill = s.toLowerCase().trim();
                        $e.append(
                            `<button class="gm-recall-knowledge-${skill}" data-skill="${skill}" data-dcs="${<string>(
                                $e.find(".identification-skills")[0].title
                            )}" data-token="${token?.id}">Recall Knowledge: ${skill}</button>`
                        );
                        const b = `.gm-recall-knowledge-${skill}`;
                        $html.find(b).on("click", async (e) => {
                            const attr = <string>$(e.currentTarget).attr("data-token");
                            // @ts-ignore
                            const token: any = game?.scenes?.active?.tokens?.get(attr);
                            const skill = $(e.currentTarget).attr("data-skill");
                            const dcs = (<string>$(e.currentTarget).attr("data-dcs")).split("/") || [];

                            const name = game.settings.get(MODULENAME, "addGmRKButtonToNpcHideNpcName")
                                ? ""
                                : ` about ${token?.name}`;
                            let content = `To Recall Knowledge${name}, roll:`;

                            for (let i = 0; i < dcs.length; i++) {
                                content += `<br>${i + 1}${nth(i + 1)}: @Check[type:${skill}|dc:${
                                    dcs[i]
                                }|traits:secret,action:recall-knowledge]`;
                                content += game.settings.get(MODULENAME, "addGmRKButtonToNpcHideSkill")
                                    ? `{Recall Knowledge} `
                                    : " ";
                            }
                            ChatMessage.create({
                                content: TextEditor.enrichHTML(content, { async: false }),
                                speaker: ChatMessage.getSpeaker({ token: token }),
                            }).then();
                        });
                    }
                });
        }
    });
}

export async function castPrivateSpell(data: ChatMessageDataPF2e, message: ChatMessagePF2e) {
    data.type = CONST.CHAT_MESSAGE_TYPES.WHISPER;
    data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    if (!game.user.isGM) {
        data.whisper.push(game.user.id);
    }
    message.updateSource(data);

    if (
        game.settings.get(MODULENAME, "castPrivateSpellWithPublicMessage") &&
        !game?.keyboard?.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT) // TODO Doesn't work on mac?
    ) {
        const vsmf = <string>(
            message.content
                .match(
                    game.i18n.localize(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.components`) +
                        " ([FVSM]+)"
                )?.[1]
                ?.toUpperCase()
        );
        let tokenName: string;
        const anonymous = game.i18n.localize(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.they`);
        if (<boolean>game.settings.get("pf2e", "metagame_tokenSetsNameVisibility")) {
            tokenName = anonymous;
        } else {
            tokenName = message.token?.name ?? message.actor?.name ?? anonymous;
        }
        const type = message.flags?.pf2e.origin?.type ?? "spell";
        const traditionString = message.flags?.pf2e.casting?.tradition ?? "";
        const origin: SpellPF2e | null = <SpellPF2e | null>await fromUuid(<string>message.flags?.pf2e.origin?.uuid);
        let content = "";
        if (origin) {
            content = game.i18n.localize(
                game.i18n.format(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.firstPart`, {
                    tokenName: tokenName,
                    vsmf: vsmf ? vsmf : "",
                    type: type,
                    traditionString: traditionString,
                })
            );

            if (game.settings.get(MODULENAME, "castPrivateSpellWithPublicMessageShowTraits")) {
                content += game.i18n.localize(
                    game.i18n.format(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessageShowTraits.traitPart`, {
                        traits: Object.values(origin.system.traits.value)
                            .map((trait) => trait.valueOf())
                            .sort()
                            .join(", "),
                    })
                );
            }

            let dcRK = 0;
            const level = origin.system.level.value;
            if (level === 1) {
                dcRK = 15;
            } else if (level === 2) {
                dcRK = 18;
            } else if (level === 3) {
                dcRK = 20;
            } else if (level === 4) {
                dcRK = 23;
            } else if (level === 5) {
                dcRK = 26;
            } else if (level === 6) {
                dcRK = 28;
            } else if (level === 7) {
                dcRK = 31;
            } else if (level === 8) {
                dcRK = 34;
            } else if (level === 9) {
                dcRK = 36;
            } else if (level === 10) {
                dcRK = 39;
            }

            switch (origin.system.traits?.rarity ?? "common") {
                case "uncommon":
                    dcRK += 2;
                    break;
                case "rare":
                    dcRK += 5;
                    break;
                case "unique":
                    dcRK += 10;
                    break;
                default:
                    dcRK += 0;
            }

            const tradition = traditionString;
            let skill = "";
            if (tradition === "arcane") {
                skill = "arcana";
            } else if (tradition === "divine") {
                skill = "religion";
            } else if (tradition === "occult") {
                skill = "occultism";
            } else if (tradition === "primal") {
                skill = "nature";
            }
            content += game.i18n.format(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.secondPartRK`, {
                skill: skill,
                dcRK: dcRK,
                rk: `&#123;${game.i18n.localize("PF2E.RecallKnowledge.Label")}\t&#125;`, // Grr
            });
        } else {
            content += game.i18n.localize(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.secondPartNoRK`);
        }

        const buttons = $(data.content).find("button");
        const saveButtons = buttons.filter((i) => buttons[i].getAttribute("data-action") === "save");
        if (saveButtons.length === 1) {
            const dataSave = saveButtons.attr("data-save") ?? "";
            const dataDC = saveButtons.attr("data-dc") ?? "";
            const origin = <SpellPF2e>await fromUuid(<string>message.flags?.pf2e.origin?.uuid);
            content += game.i18n.format(`${MODULENAME}.SETTINGS.castPrivateSpellWithPublicMessage.savePart`, {
                dataSave: dataSave,
                dataDC: dataDC,
                traits: Object.values(origin.system.traits.value)
                    .map((trait) => game.pf2e.system.sluggify(trait.valueOf()))
                    .sort()
                    .join(","),
            });
        }

        const token: any = message.token ? message.token : message.actor?.token;
        ChatMessage.create({
            content: content,
            speaker: ChatMessage.getSpeaker({ token: token }),
        }).then();
    }
}
