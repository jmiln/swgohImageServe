module.exports = {
    apps: [
        {
            name: "imageServe",
            script: "index.ts",
            node_args: "--env-file=.env",
            autorestart: true,
        },
    ],
};
