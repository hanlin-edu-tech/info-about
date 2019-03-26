var packageJson = require('./package.json');
var version = packageJson.version;
var branchVers, platformUrl, s3Path, webcomponentVersion;
updateBranchVers(packageJson.defaultBranch);
var gulp = require('gulp-param')(require('gulp'), process.argv);
var rename = require("gulp-rename");
var fs = require('fs');
var es = require('event-stream');
var del = require('del');
var path = require('path');
var Q = require('q');
var util = require('gulp-template-util');

var browserify = require('browserify');
var coffeeify = require('coffeeify');
var less = require('less');
var pug = require('pug');

var Storage = require('@google-cloud/storage').Storage;
var storage = new Storage();

var distPath = 'dist/info/about';

function updateBranchVers(branch){
    branchVers = packageJson.branch[branch];
    platformUrl = branchVers.platformUrl;
    s3Path = branchVers.s3Path;
    webcomponentVersion = branchVers.webcomponentVersion;
}

function buildHtml(){
    return es.map(function(file, cb){
        file.contents = new Buffer(pug.renderFile(
            file.path, { 
                filename : file.path,
                version : version,
                platformUrl : platformUrl,
                s3Path : s3Path,
                webcomponentVersion : webcomponentVersion
            }
        ));
        cb(null, file);
    });
}

function buildScript(){
    return es.map(function(file, cb){
        var bundle = browserify({extensions : ['.coffee']});
        bundle.transform(coffeeify, {bare : false, header : true});
        bundle.add(file.path);
        bundle.bundle(function(error, result){
            if(error != null){
                console.log(error);
                throw error;
            }
            file.contents = new Buffer(result);
            cb(null, file);
        });
    });
}

function buildStyle(){
    return es.map(function(file, cb){
        less.render(
            file.contents.toString(), {
                paths : [],
                filename : file.path,
                compress : false,
                modifyVars : {version : `"${version}"`}
            },
            function(error, result){
                if(error != null){
                    console.log(error);
                    throw error;
                }
                file.contents = new Buffer(result.css);
                cb(null, file);
            }
        );
    });
}

function uploadGCS(bucket, metadata){
    return es.map(function(file, cb){
        if(file.isDirectory()){
            cb(null, file);
        }else{
            var options = {
                destination: file.relative,
                resumable: true
            };
            if(file.relative.substr(file.relative.length-5, 5).toLowerCase() == ".html"){
                options.metadata = {cacheControl: 'public, max-age=3600'};
            }
            storage.bucket(bucket).upload(file.path, options, function(error){
                if(error != null){
                    console.log(error);
                    throw error;
                }
                storage.bucket(bucket).file(file.relative).makePublic(function(error){
                    if(error != null){
                        console.log(error);
                        throw error;                        
                    }
                    console.log(file.relative+" uploaded");
                    cb(null, file);
                });
            });            
        }
    });
}

function libTask(dest){
    return function(){
        if(!packageJson.dependencies){
            packageJson.dependencies = {};
        }
        var webLibModules = [];
        for(var module in packageJson.dependencies){
            webLibModules.push('node_modules/' + module + '/**/*');
        }
        return gulp.src(webLibModules, {base : 'node_modules/'})
            .pipe(gulp.dest(dest));};   
}

function htmlTask(dest){
    return function(){
        return gulp.src('src/pug/**/*.pug')
            .pipe(buildHtml())
            .pipe(rename({extname:'.html'}))
            .pipe(gulp.dest(dest));};    
}

function scriptTask(dest){
    return function(){
        return gulp.src('src/coffee/**/*.coffee')
            .pipe(buildScript())
            .pipe(rename({extname:'.js'}))
            .pipe(gulp.dest(dest));};
}

function styleTask(dest){
    return function(){
        return gulp.src('src/less/**/*.less')
            .pipe(buildStyle())
            .pipe(rename({extname:'.css'}))
            .pipe(gulp.dest(dest));};
}

function copyImgTask(dest){
    return function(){
        return gulp.src('src/img/**/*')
            .pipe(gulp.dest(dest));};
}


function cleanDistTask(){
    return del(['dist']);    
}

function cleanTask(){
    return del([
        'dist',
        'src/**/*.html',
        `src/${version}`]);
}

function copyHtmlTask(){
    return gulp.src('src/**/*.html')
        .pipe(gulp.dest(distPath));
}

function deployTask(branch){
    updateBranchVers(branch);
    console.log(`Branch is ${branch}`)
    return gulp.src('dist/**/*')
        .pipe(uploadGCS(branchVers.bucket));
}


gulp.task('clean', cleanTask);
gulp.task('deploy', deployTask)

gulp.task('html', htmlTask('src'));
gulp.task('script', scriptTask(`src/${version}/js`));
gulp.task('style', styleTask(`src/${version}/css`));
gulp.task('lib', libTask(`src/${version}/lib`))
gulp.task('build', ['clean'], function(){
    var deferred = Q.defer();
    Q.fcall(function(){return util.logStream(libTask(`src/${version}/lib`))})
    .then(function(){return Q.all([
        util.logStream(copyImgTask(`src/${version}/img`)),
        util.logStream(htmlTask('src')),
        util.logStream(scriptTask(`src/${version}/js`)),
        util.logStream(styleTask(`src/${version}/css`))])});
    return deferred.promise;
});


gulp.task('watch', function() {
  gulp.watch('src/pug/**/*.pug', ['html']);
  gulp.watch('src/coffee/**/*.coffee', ['script']);
  gulp.watch('src/less/**/*.less', ['style']);
});

gulp.task('package', ['lib'], function(branch){
    if(typeof branch !== 'boolean' && branch){
        console.log(`Branch is ${branch}`)
        updateBranchVers(branch);
    }
    var deferred = Q.defer();
    Q.fcall(function(){return util.logPromise(cleanDistTask)})
    .then(function(){return Q.all([
        util.logStream(copyImgTask(`${distPath}/${version}/img`)),
        util.logStream(libTask(`${distPath}/${version}/lib`)),
        util.logStream(htmlTask(distPath)),
        util.logStream(scriptTask(`${distPath}/${version}/js`)),
        util.logStream(styleTask(`${distPath}/${version}/css`))])});
    return deferred.promise;
});
