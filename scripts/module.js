
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
                one: {
                    label: game.i18n.format("SWDC.cal"),
                    callback: (html) => {
                        let damage = Number(html.find("#damage")[0].value)
                        let ap = Number(html.find("#ap")[0].value)
                        let targets = canvas.tokens.controlled
                        for (let target of targets) {
                            const { armor, modifier, value } = target.actor.data.data.stats.toughness
                            let apNeg = Math.min(ap, armor)
                            let newT = value - apNeg
                            let excess = damage - newT
                            let content;
                            if (excess < 0) {
                                content = `
                            <div class="damageCard">
                                <div class="col1">
                                    <img src="systems/swade/assets/icons/status/status_defending.svg">
                                </div>
                                <div class="col2 ">
                                    <div class="name"> ${target.name} ${game.i18n.format("SWDC.is")}</div>
                                    <button class="result">${game.i18n.format("SWDC.notHarmed")}</button>
                            </div>`
                            }
                            else if (excess >= newT) {
                                let wounds = Math.floor(excess / newT)
                                content = `
                            <div class="damageCard">
                                <div class="col1">
                                    <img src="modules/swade-damage-cards/assets/blood.svg">
                                </div>
                            <div class="col2">
                                <div class="name">${target.name} ${game.i18n.format("SWDC.takes")}</div>
                                <button class="result">${wounds} ${wounds > 1 ? game.i18n.format("SWDC.wounds") : game.i18n.format("SWDC.wound")}</button>
                            </div>
                            `
                            }
                            else if (excess < newT) {
                                content = `
                            <div class="damageCard">
                            <div class="col1">
                                <img src="systems/swade/assets/icons/status/status_shaken.svg">
                            </div>
                            <div class="col2">
                                <div class="name"> ${target.name} ${game.i18n.format("SWDC.is")}</div>
                                <button class="result">${game.i18n.format("SWADE.Shaken")}</button>
                        </div>`
                            }

                            ChatMessage.create({ content: content })
                        }
                    }
                }
            }
        }, { classes: ["swade-damage-cards"] }).render(true)
    }
}

globalThis.DamageCard = DamageCard