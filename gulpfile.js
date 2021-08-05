let preprocessor = 'sass', // Preprocessor (sass, less, styl); 'sass' also work with the Scss syntax in blocks/ folder.
		fileswatch   = 'html,htm,txt,json,md,woff2' // List of files extensions for watching & hard reload

const { src, dest, parallel, series, watch } = require('gulp')
const browserSync  = require('browser-sync').create()
const bssi         = require('browsersync-ssi')
const ssi          = require('ssi')
const webpack      = require('webpack-stream')
const sass         = require('gulp-sass')(require('sass'))
const sassglob     = require('gulp-sass-glob')
const less         = require('gulp-less')
const lessglob     = require('gulp-less-glob')
const styl         = require('gulp-stylus')
const stylglob     = require("gulp-noop")
const cleancss     = require('gulp-clean-css')
const autoprefixer = require('gulp-autoprefixer')
const rename       = require('gulp-rename')
const imagemin     = require('gulp-imagemin')
const newer        = require('gulp-newer')
const rsync        = require('gulp-rsync')
const del          = require('del')
const purgecss     = require('gulp-purgecss')
const cached       = require('gulp-cached')
const dependents   = require('gulp-dependents')
var config = {
    ".scss": {
 
        // The sequence of RegExps and/or functions to use when parsing
        // dependency paths from a source file. Each RegExp must have the
        // 'gm' modifier and at least one capture group. Each function must
        // accept a string and return an array of captured strings. The
        // strings captured by each RegExp or function will be passed
        // to the next, thus iteratively reducing the file content to an
        // array of dependency file paths.
        parserSteps: [
 
            // PLEASE NOTE:
            // The parser steps shown here are only meant as an example to
            // illustrate the concept of the matching pipeline.
            // The default config used for scss files is pure RegExp and
            // reliably supports the full syntax of scss import statements.
 
            // Match the import statements and capture the text
            // between '@import' and ';'.
            /^\s*@import\s+(.+?);/gm,
 
            // Split the captured text on ',' to get each path.
            function (text) { return text.split(","); },
 
            // Match the balanced quotes and capture only the file path.
            /"([^"]+)"|'([^']+)'/m
        ],
 
        // The file name prefixes to try when looking for dependency
        // files, if the syntax does not require them to be specified in
        // dependency statements. This could be e.g. '_', which is often
        // used as a naming convention for mixin files.
        prefixes: ['_'],
 
        // The file name postfixes to try when looking for dependency
        // files, if the syntax does not require them to be specified in
        // dependency statements. This could be e.g. file name extensions.
        postfixes: ['.scss', '.sass'],
 
        // The additional base paths to try when looking for dependency
        // files referenced using relative paths.
        basePaths: [],
    }
};
function browsersync() {
	browserSync.init({
		server: {
			baseDir: 'app/',
			middleware: bssi({ baseDir: 'app/', ext: '.html' })
		},
		ghostMode: { clicks: false },
		notify: false,
		online: true,
		// tunnel: 'yousutename', // Attempt to use the URL https://yousutename.loca.lt
	})
}

function scripts() {
	return src(['app/js/*.js', '!app/js/*.min.js'])
		.pipe(webpack({
			mode: 'production',
			performance: { hints: false },
			module: {
				rules: [
					{
						test: /\.(js)$/,
						exclude: /(node_modules)/,
						loader: 'babel-loader',
						query: {
							presets: ['@babel/env'],
							plugins: ['babel-plugin-root-import']
						}
					}
				]
			}
		})).on('error', function handleError() {
			this.emit('end')
		})
		.pipe(rename('app.min.js'))
		.pipe(dest('app/js'))
		.pipe(browserSync.stream())
}

function styles() {
	return src([`app/styles/${preprocessor}/*.*`, `!app/styles/${preprocessor}/_*.*`])
        .pipe(cached('scssCache'))
        .pipe(dependents(config))
		.pipe(eval(`${preprocessor}glob`)())
		.pipe(eval(preprocessor)())
		.pipe(dest('app/css'))
}

function minimaze() {
	return src([`app/css/*.css`, `!app/css/*.min.css`])
        .pipe(purgecss({ content: ['dist/index.html', 'app/js/app.min.js'] }))
        .pipe(autoprefixer({ overrideBrowserslist: ['last 10 versions'], grid: true }))
        .pipe(cleancss({ level: { 2: { specialComments: 0 } },/* format: 'beautify' */ }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest('app/css'))
        .pipe(browserSync.stream())
}

function images() {
	return src(['app/images/src/**/*'])
		.pipe(newer('app/images/dist'))
		.pipe(imagemin())
		.pipe(dest('app/images/dist'))
		.pipe(browserSync.stream())
}

function buildcopy() {
	return src([
		'{app/js,app/css}/*.min.*',
		'app/images/**/*.*',
		'!app/images/src/**/*',
		'app/fonts/**/*'
	], { base: 'app/' })
		.pipe(dest('dist'))
}

async function buildhtml() {
	let includes = new ssi('app/', 'dist/', '/**/*.html')
	includes.compile()
	del('dist/parts', { force: true })
}

function cleandist() {
	return del('dist/**/*', { force: true })
}

function deploy() {
	return src('dist/')
		.pipe(rsync({
			root: 'dist/',
			hostname: 'username@yousite.com',
			destination: 'yousite/public_html/',
			// clean: true, // Mirror copy with file deletion
			include: [/* '*.htaccess' */], // Included files to deploy,
			exclude: ['**/Thumbs.db', '**/*.DS_Store'],
			recursive: true,
			archive: true,
			silent: false,
			compress: true
		}))
}

function startwatch() {
	watch(`app/styles/${preprocessor}/**/*`, { usePolling: true }, styles)
	watch(['app/js/**/*.js', '!app/js/**/*.min.js'], { usePolling: true }, scripts)
	watch('app/images/src/**/*.{jpg,jpeg,png,webp,svg,gif}', { usePolling: true }, images)
	watch('app/**/*.html', { usePolling: true }, buildhtml)
	watch(['app/css/*.css','!app/css/*.min.css','dist/*.html', 'app/js/*.min.js'], { usePolling: true }, minimaze)
	watch(`app/**/*.{${fileswatch}}`, { usePolling: true }).on('change', browserSync.reload)
}

exports.styles  = styles
exports.images  = images
exports.deploy  = deploy
exports.assets  = series(scripts, buildhtml, styles, minimaze, images)
exports.build   = series(cleandist, scripts, buildhtml, styles, minimaze, images, buildcopy)
exports.default = series(scripts, buildhtml, styles, minimaze, images, parallel(browsersync, startwatch))
