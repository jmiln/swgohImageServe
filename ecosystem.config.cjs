module.exports = {
    apps: [
        {
            name: "imageServe",
            script: "index.ts",
            interpreter: "node",
            node_args: "--env-file=.env",
            env: {
                APP_NAME: "ImageServe",
            },
        },
    ],
};
