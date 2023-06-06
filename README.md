Just a little side app to make images for the ;mycharacter command from SWGOHBot

This grabs images from swgoh.gg the first time a request comes through, then uses the stored one after that

If available and set up, this will also pull from swgoh-ae2, which pulls from the game instead of swgoh.gg
    - https://github.com/swgoh-utils/swgoh-ae2

GearIcons/ is the base images that go around the character's images
imageOut/ is where all the ones that are created are stored.
partials/, css/, and ejs/ are where the it's all put together to make em look correct



In order to use this, you need to send a POST request to the IP that it's running on
(Ex: http://localhost:3600)
You can use an app like Postman to test this locally

Using it in my bot, this is how I get the images

```js
const getUnitImage = async (defId, {rarity, level, gear, skills, relic}) => {
    const thisChar = unitsList.find(ch => ch.uniqueName === defId);
    if (!thisChar) return console.error("[getImage] Cannot find matching defId");
    const fetchBody = {
        defId: defId,
        charUrl: thisChar?.avatarURL,
        avatarName: thisChar?.avatarName,
        rarity: rarity,
        level: level,
        gear: gear,
        zetas: skills?.filter(s => s.isZeta && (s.tier === s.tiers || (s.isOmicron && s.tier >= s.tiers-1))).length || 0,
        relic: relic?.currentTier ? relic.currentTier : 0,
        omicron: skills?.filter(s => s.isOmicron && s.tier === s.tiers).length || 0,
        side: thisChar.side
    };

    try {
        return await fetch(config.imageServIP_Port + "/char/", {
            method: "post",
            body: JSON.stringify(fetchBody),
            headers: { "Content-Type": "application/json" }
        })
            .then(async response => {
                const resBuf = await response.arrayBuffer();
                if (!resBuf) return null;
                return Buffer.from(resBuf);
            });
    } catch (e) {
        console.error("[getUnitImage] Something broke while requesting image.\n" + e);
        return null;
    }
}
```
