const path = require('path');


module.exports = {
    entry: {
        "main": "./src/main.ts"
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    devtool: 'inline-source-map',
    mode: 'development',
    devServer: {
        static: [{
            directory: './dist',
            publicPath: '/',
            watch: true,
        },{
            directory: './public',
            publicPath: '/',
            watch: true,
        },{
            directory: './node_modules/litegraph.js/css/',
            publicPath: '/',
            watch: false
        }],
        client: {
            progress: true,
        },
    },
};
