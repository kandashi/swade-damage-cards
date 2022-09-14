Hooks.on('ready', function () {
    game.socket.on('module.swade-wounds-calculator', soakPrompt);
});

async function soakPrompt({ tokenActorUUID, woundsInflicted, statusToApply }) {
    let actor;
    const documentObject = await fromUuid(tokenActorUUID);
    if (documentObject.constructor.name === 'TokenDocument') {
        actor = documentObject.actor;
    } else if (documentObject.constructor.name === 'SwadeActor') {
        actor = documentObject;
    }
    const isOwner = actor.ownership[game.userId] === 3;
    if (isOwner && statusToApply !== "none") {
        if (statusToApply === "wounded") {
            const woundsText = `${woundsInflicted} ${woundsInflicted > 1 ? game.i18n.format("SWWC.wounds") : game.i18n.format("SWWC.wound")}`;
            new Dialog({
                title: game.i18n.format("SWWC.soakTitle"),
                content: game.i18n.format("SWWC.soakDmgPrompt", { name: actor.name, wounds: woundsText }),
                buttons: {
                    soakBenny: {
                        label: game.i18n.format("SWWC.soakBenny"),
                        callback: async () => {
                            if (actor.isWildcard && actor.bennies > 0) {
                                actor.spendBenny();
                            } else if (!actor.isWildcard && game.user.isGM && game.user.bennies > 0) {
                                game.user.spendBenny();
                            }
                            await attemptSoak(actor, woundsInflicted, statusToApply, woundsText);
                        }
                    },
                    soakFree: {
                        label: game.i18n.format("SWWC.soakFree"),
                        callback: async () => {
                            await attemptSoak(actor, woundsInflicted, statusToApply, woundsText);
                        }
                    },
                    take: {
                        label: game.i18n.format("SWWC.takeWounds", { wounds: woundsText }),
                        callback: async () => {
                            const existingWounds = actor.system.wounds.value;
                            const maxWounds = actor.system.wounds.max;
                            const totalWounds = existingWounds + woundsInflicted;
                            const newWoundsValue = totalWounds < maxWounds ? totalWounds : maxWounds;
                            let message = game.i18n.format("SWWC.woundsTaken", { name: actor.name, wounds: woundsText });
                            await actor.updateSource({ 'system.wounds.value': newWoundsValue });
                            if (totalWounds > maxWounds) {
                                message = await applyIncapacitated(actor);
                            } else {
                                await applyShaken(actor);
                            }
                            await ChatMessage.create({ content: message });
                        }
                    }
                },
                default: "soakBenny"
            }, { classes: ["swade-app"] }).render(true);
        } else if (statusToApply === "shaken") {
            let message = game.i18n.format("SWWC.isShaken", { name: actor.name });
            await applyShaken(actor);
            await ChatMessage.create({ content: message });
        }
    }
}

async function attemptSoak(actor, woundsInflicted, statusToApply, woundsText, bestSoakAttempt = null) {
    // TODO: Figure out how to delay the results message until after the DSN roll animation completes.
    let vigorRoll = await actor.rollAttribute('vigor');
    let message;
    const woundsSoaked = Math.floor(vigorRoll.total / 4);
    const existingWounds = actor.system.wounds.value;
    const maxWounds = actor.system.wounds.max;
    let woundsRemaining = woundsInflicted - woundsSoaked;
    if (woundsRemaining <= 0) {
        message = game.i18n.format("SWWC.soakedAll", { name: actor.name });
        await ChatMessage.create({ content: message });
    } else {
        const totalWounds = existingWounds + woundsRemaining;
        const newWoundsValue = totalWounds < maxWounds ? totalWounds : maxWounds;
        if (bestSoakAttempt !== null && woundsRemaining > bestSoakAttempt) {
            woundsRemaining = bestSoakAttempt;
        }
        const woundsRemainingText = `${woundsRemaining} ${woundsRemaining > 1 || woundsRemaining === 0 ? game.i18n.format("SWWC.wounds") : game.i18n.format("SWWC.wound")}`;
        const newWoundsValueText = `${newWoundsValue} ${newWoundsValue > 1 || newWoundsValue === 0 ? game.i18n.format("SWWC.wounds") : game.i18n.format("SWWC.wound")}`;
        new Dialog({
            title: game.i18n.format("SWWC.rerollSoakTitle"),
            content: game.i18n.format("SWWC.rerollSoakDmgPrompt", { name: actor.name, wounds: woundsRemainingText }),
            buttons: {
                rerollBenny: {
                    label: game.i18n.format("SWWC.rerollSoakBenny"),
                    callback: async () => {
                        if (actor.isWildcard && actor.bennies > 0) {
                            actor.spendBenny();
                        } else if (!actor.isWildcard && game.user.isGM && game.user.bennies > 0) {
                            game.user.spendBenny();
                        }
                        await attemptSoak(actor, woundsInflicted, statusToApply, woundsText, woundsRemaining);
                    }
                },
                rerollFree: {
                    label: game.i18n.format("SWWC.rerollSoakFree"),
                    callback: async () => {
                        await attemptSoak(actor, woundsInflicted, statusToApply, woundsText, woundsRemaining);
                    }
                },
                accept: {
                    label: game.i18n.format("SWWC.takeWounds", { wounds: woundsRemainingText }),
                    callback: async () => {
                        if (statusToApply === 'shaken') {
                            if (actor.system.status.isShaken) {
                                await actor.updateSource({ 'system.wounds.value': newWoundsValue });
                            }
                            await applyShaken(actor);
                            message = game.i18n.format("SWWC.isShaken", { name: actor.name });
                        }
                        if (statusToApply === 'wounded') {
                            await actor.updateSource({ 'system.wounds.value': newWoundsValue });
                            if (totalWounds > maxWounds) {
                                message = await applyIncapacitated(actor);
                            } else {
                                await applyShaken(actor);
                            }
                            message = game.i18n.format("SWWC.woundsTaken", { name: actor.name, wounds: newWoundsValueText });
                        }

                        await ChatMessage.create({ content: message });
                    }
                },
            },
            default: "rerollBenny"
        }, { classes: ["swade-app"] }).render(true);
    }
}

async function applyShaken(actor) {
    const isShaken = actor.system.status.isShaken;
    if (!isShaken) {
        const data = CONFIG.SWADE.statusEffects.find(s => s.id === 'shaken');
        await actor.toggleActiveEffect(data, { active: true });
    }
}

async function applyIncapacitated(actor) {
    const isIncapacitated = actor.effects.find((e) => e.label === 'Incapacitated');
    if (isIncapacitated === undefined) {
        const data = CONFIG.SWADE.statusEffects.find((s) => s.id === 'incapacitated');
        await actor.toggleActiveEffect(data, { active: true });
    }
    return game.i18n.format("SWWC.incapacitated", { name: actor.name });
}

class WoundsCalculator {
    static render() {
        const targets = canvas.tokens.objects.children.filter((t) => t.targeted.size > 0 && !!Array.from(t.targeted).find((u) => u.id === game.userId));
        if (targets.length) {
            new Dialog({
                title: game.i18n.format("SWWC.title"),
                content: `
                    <label for="damage">${game.i18n.format("SWADE.Dmg")}</label>
                    <input type="number" id="damage" autofocus>
                    <label for="ap">${game.i18n.format("SWADE.Ap")}</label>
                    <input type="number" id="ap">
                `,
                buttons: {
                    calculate: {
                        label: game.i18n.format("SWWC.calculate"),
                        callback: async (html) => {
                            const damage = Number(html.find("#damage")[0].value);
                            const ap = Number(html.find("#ap")[0].value);
                            for (const target of targets) {
                                let { armor, value } = target.actor.system.stats.toughness;
                                if (target.actor.type === "vehicle") {
                                    armor = Number(target.actor.system.toughness.armor);
                                    value = Number(target.actor.system.toughness.total);
                                }
                                const apNeg = Math.min(ap, armor);
                                const newT = value - apNeg;
                                const excess = damage - newT;
                                let woundsInflicted = Math.floor(excess / 4);
                                let statusToApply = 'none';
                                if (excess >= 0 && excess < 4) {
                                    statusToApply = "shaken";
                                    if (target.actor.system.status.isShaken && woundsInflicted === 0) {
                                        woundsInflicted = 1;
                                        statusToApply = "wounded";
                                    }
                                } else if (excess >= 4) {
                                    statusToApply = "wounded";
                                }
                                const playerOwners = Object.keys(target.actor.ownership).filter((id) => {
                                    return game.users.find((u) => u.id === id && !u.isGM);
                                });
                                if (game.user.isGM && playerOwners.length === 0) {
                                    await soakPrompt({
                                        tokenActorUUID: target.actor.uuid,
                                        woundsInflicted: woundsInflicted,
                                        statusToApply: statusToApply
                                    });
                                } else {
                                    game.socket.emit('module.swade-wounds-calculator', {
                                        tokenActorUUID: target.actor.uuid,
                                        woundsInflicted: woundsInflicted,
                                        statusToApply: statusToApply
                                    });
                                }
                            }
                        }
                    }
                },
                default: "calculate"
            }, { classes: ["swade-app"] }).render(true);
        } else {
            ui.notifications.warn("Please select one or more Targets.");
        }
    }
}

globalThis.WoundsCalculator = WoundsCalculator;
