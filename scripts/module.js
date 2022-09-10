Hooks.on('ready', function () {
    game.socket.on('module.swade-damage-cards', applyDamage);
});

async function applyDamage({ tokenActorUUID, woundsInflicted, statusToApply }) {
    if (statusToApply !== "none") {
        let actor;
        const documentObject = await fromUuid(tokenActorUUID);
        if (documentObject.constructor.name === 'TokenDocument') {
            actor = documentObject.actor
        } else if (documentObject.constructor.name === 'SwadeActor') {
            actor = documentObject;
        }
        const owner = actor.data.permission[game.userId] === 3;
        if (owner) {
            const woundsText = `${woundsInflicted} ${woundsInflicted > 1 ? game.i18n.format("SWDC.wounds") : game.i18n.format("SWDC.wound")}`;
            new Dialog({
                title: game.i18n.format("SWDC.soakTitle"),
                content: game.i18n.format("SWDC.soakDmgPrompt", { name: actor.name, wounds: woundsText }),
                buttons: {
                    soakBenny: {
                        label: game.i18n.format("SWDC.soakBenny"),
                        callback: async () => {
                            if (actor.isWildcard && actor.bennies > 0) {
                                actor.spendBenny();
                            } else if (!actor.isWildcard && game.user.isGM && game.user.bennies > 0) {
                                game.user.spendBenny();
                            }
                            await attemptSoak(actor, woundsInflicted, statusToApply, woundsText)
                        }
                    },
                    soakFree: {
                        label: game.i18n.format("SWDC.soakFree"),
                        callback: async () => {
                            await attemptSoak(actor, woundsInflicted, statusToApply, woundsText)
                        }
                    },
                    take: {
                        label: game.i18n.format("SWDC.takeWounds", { wounds: woundsText }),
                        callback: async () => {
                            const existingWounds = actor.data.data.wounds.value;
                            const maxWounds = actor.data.data.wounds.max;
                            const totalWounds = existingWounds + woundsInflicted;
                            const newWoundsValue = totalWounds < maxWounds ? totalWounds : maxWounds;
                            let message = game.i18n.format("SWDC.woundsTaken", { name: actor.name, wounds: woundsText });
                            await applyShaken(actor);
                            await actor.update({ 'data.wounds.value': newWoundsValue });
                            if (totalWounds > maxWounds) {
                                message = await applyIncapacitated(actor);
                            }
                            await ChatMessage.create({ content: message });
                        }
                    }
                },
                default: "soakBenny"
            }, { classes: ["swade-app", "swade-damage-cards", "swade-damage-cards-soak"] }).render(true);
        }
    }
}

async function attemptSoak(actor, woundsInflicted, statusToApply, woundsText) {
    // TODO: Figure out how to delay the results message until after the DSN roll animation completes.
    let vigorRoll = await actor.rollAttribute('vigor');
    let message;
    const woundsSoaked = Math.floor(vigorRoll.total / 4);
    const existingWounds = actor.data.data.wounds.value;
    const maxWounds = actor.data.data.wounds.max;
    const woundsRemaining = woundsInflicted - woundsSoaked;
    if (woundsRemaining <= 0) {
        message = game.i18n.format("SWDC.soakedAll", { name: actor.name });
        await ChatMessage.create({ content: message });
    } else {
        const totalWounds = existingWounds + woundsRemaining;
        const newWoundsValue = totalWounds < maxWounds ? totalWounds : maxWounds;
        const woundsRemainingText = `${woundsRemaining} ${woundsRemaining > 1 ? game.i18n.format("SWDC.wounds") : game.i18n.format("SWDC.wound")}`;
        new Dialog({
            title: game.i18n.format("SWDC.rerollSoakTitle"),
            content: game.i18n.format("SWDC.rerollSoakDmgPrompt", { name: actor.name, wounds: woundsRemainingText }),
            buttons: {
                rerollBenny: {
                    label: game.i18n.format("SWDC.rerollSoakBenny"),
                    callback: async () => {
                        if (actor.isWildcard && actor.bennies > 0) {
                            actor.spendBenny();
                        } else if (!actor.isWildcard && game.user.isGM && game.user.bennies > 0) {
                            game.user.spendBenny();
                        }
                        await attemptSoak(actor, woundsInflicted, statusToApply, woundsText);
                    }
                },
                rerollFree: {
                    label: game.i18n.format("SWDC.rerollSoakFree"),
                    callback: async () => {
                        await attemptSoak(actor, woundsInflicted, statusToApply, woundsText);
                  }
                },
                accept: {
                    label: game.i18n.format("SWDC.takeWounds", { wounds: woundsRemainingText }),
                    callback: async () => {
                        if (statusToApply === 'shaken') {
                            if (actor.data.data.status.isShaken) {
                                await actor.update({ 'data.wounds.value': newWoundsValue });
                            }
                            await applyShaken(actor);
                            message = game.i18n.format("SWDC.isShaken", { name: actor.name });
                        }
                        if (statusToApply === 'wounded') {
                            await applyShaken(actor);
                            await actor.update({ 'data.wounds.value': newWoundsValue });
                            message = game.i18n.format("SWDC.woundsTaken", { name: actor.name, wounds: newWoundsValue });
                        }
                        if (totalWounds > maxWounds) {
                            message = await applyIncapacitated(actor);
                        }
                        await ChatMessage.create({ content: message });
                    }
                },
            },
            default: "rerollBenny"
        }, { classes: ["swade-app", "swade-damage-cards", "swade-damage-cards-soak"] }).render(true);
    }
}

async function applyShaken(actor) {
    const data = CONFIG.SWADE.statusEffects.find(s => s.id === 'shaken');
    if (!actor.data.data.status.isShaken) {
        await actor.toggleActiveEffect(data, { active: true });
    }
}

async function applyIncapacitated(actor) {
    const data = CONFIG.SWADE.statusEffects.find((s) => s.id === 'incapacitated');
    const isIncapacitated = actor.data.effects.find((e) => e.data.label === 'Incapacitated');
    if (!isIncapacitated) {
        await actor.toggleActiveEffect(data, { active: true });
    }
    return game.i18n.format("SWDC.incapacitated", { name: actor.name });
}

class DamageCard {
    static render() {
        new Dialog({
            title: game.i18n.format("SWDC.title"),
            content: `
                <label for="damage">${game.i18n.format("SWADE.Dmg")}</label>
                <input type="number" id="damage" autofocus>
                <label for="ap">${game.i18n.format("SWADE.Ap")}</label>
                <input type="number" id="ap">
            `,
            buttons: {
                calculate: {
                    label: game.i18n.format("SWDC.calculate"),
                    callback: async (html) => {
                        const damage = Number(html.find("#damage")[0].value);
                        const ap = Number(html.find("#ap")[0].value);
                        const targets = canvas.tokens.objects.children.filter((t) => t.targeted.size > 0 && !!Array.from(t.targeted).find((u) => u.id === game.userId));
                        for (const target of targets) {
                            let { armor, value } = target.actor.data.data.stats.toughness;
                            if (target.actor.data.type === "vehicle") {
                                armor = Number(target.actor.data.data.toughness.armor);
                                value = Number(target.actor.data.data.toughness.total);
                            }
                            const apNeg = Math.min(ap, armor);
                            const newT = value - apNeg;
                            const excess = damage - newT;
                            let wounds = Math.floor(excess / 4);
                            let status = 'none';
                            if (excess >= 0 && excess < 4) {
                                status = "shaken";
                                if (target.actor.data.data.status.isShaken && wounds === 0) {
                                    wounds = 1;
                                    status = "wounded";
                                }
                            } else if (excess >= 4) {
                                status = "wounded";
                            }
                            game.socket.emit('module.swade-damage-cards', {
                                tokenActorUUID: target.actor.uuid,
                                woundsInflicted: wounds,
                                statusToApply: status
                            });
                        }
                    }
                }
            },
            default: "calculate"
        }, { classes: ["swade-app", "swade-damage-cards"] }).render(true);
    }
}

globalThis.DamageCard = DamageCard;
