const gulp = require('gulp');
const through = require('through-gulp');
const os = require('os')
const p = require('path')
const fs = require('fs')
const clean = require('gulp-clean')
const less = require('less')
const postCss = require('postcss')
const postCssModules = require('postcss-modules')

const { buildApp,buildPage} = require('./babel')

function converAppTask() {
  var stream = through(function (file, encoding, callback) {
    const fileName = file.relative.split(os.platform() == 'win32' ? '\\' : '/')[0]
    const str = file.contents.toString()
    const rootFile = p.join(file.base, '../')
    const tranFileName = fileName.replace(fileName[0], fileName[0].toLowerCase())
    console.log('开始编译app.js', fileName)
    const result = buildApp({
      str,
      rootFile,
      filePath: file.path,
      dirName: file.dirname,
      fileName: tranFileName,
      targetPath: file.path.replace(rootFile,p.join(process.cwd(),'dist') + '/')
    })
    file.contents = new Buffer(result)
    this.push(file)
    callback();
  }, function (callback) {
    callback();
  });
  return stream;
}

function coverPageTask() {
  var stream = through(function (file, encoding, callback) {
    const fileName = file.relative.split(os.platform() == 'win32' ? '\\' : '/')[0]
    const str = file.contents.toString()
    const rootFile = p.join(file.base, '../')
    const tranFileName = fileName.replace(fileName[0], fileName[0].toLowerCase())
    console.log('开始编译', fileName)
    const result = buildPage({
      str,
      rootFile,
      filePath: file.path,
      dirName: file.dirname,
      fileName: tranFileName,
      targetPath: file.path.replace(rootFile, p.join(process.cwd(), 'dist') + '/')
    })
    file.contents = new Buffer(result)
    this.push(file)
    callback();
  }, function (callback) {
    callback();
  });
  return stream;
}

function lessTask() {
  var stream = through(async(file, encoding, callback) => {
    const fileName = file.relative.split(os.platform() == 'win32' ? '\\' : '/')[0]
    const str = file.contents.toString()
    const rootFile = p.join(file.base, '../')
    const tranFileName = fileName.replace(fileName[0], fileName[0].toLowerCase())
    console.log('转换less', fileName)
    const json = require('./less.json')
    const lessStr = await less.render(str)
    const cssModule = await postCss([
      postCssModules({
        getJSON: function () {

        },
        generateScopedName: "[name]__[local]___[hash:base64:5]",
      }),
    ]).process(lessStr.css, { from: file.path })
    const find = cssModule.messages.find((el) => el.plugin == 'postcss-modules')
    if (find) {
      json[file.path] = find.exportTokens
    }
    fs.writeFileSync('./less.json',JSON.stringify(json),'utf-8')
    file.contents = new Buffer('')
    callback();
  }, function (callback) {
    callback();
  });
  return stream;
}

// gulp.src(['你的文件路径/**/*.*'])
// .pipe(gulp.dest('dist'))

gulp.task('clean',()=>{
  return gulp.src(['dist'])
  .pipe(clean())
})

gulp.task('copy',()=>{
  return gulp.src(['你的文件路径/**/*.*'])
  .pipe(gulp.dest('dist'))
})

gulp.task('app',()=>{
  return gulp.src(['你的文件路径/app.js'])
  .pipe(converAppTask())
  .pipe(gulp.dest('dist'))
})

gulp.task('components',()=>{
  return gulp.src(['你的文件路径/components/**/*.js', '!你的文件路径/components/vant-weapp/**/*.*'])
  .pipe(coverPageTask())
  .pipe(gulp.dest('dist/components'))
})

gulp.task('page',()=>{
  return gulp.src(['你的文件路径/pages/**/*.js'])
  .pipe(coverPageTask())
  .pipe(gulp.dest('dist/pages'))
})

// gulp.src(['你的文件路径/pages/activePage/index.js'])
// .pipe(coverPageTask())
// gulp.task('less',()=>{
//   return gulp.src([
//     p.join(process.cwd(),'/dist/pages/**/*.less'),
//     p.join(process.cwd(),'/dist/components/**/*.less'),
//     '!' + p.join(process.cwd(),'/dist/components/vant-weapp/**/*.*')
//   ])
//   .pipe(lessTask())
// })
gulp.series(['clean', 'copy','app','page','components'])()
// gulp.series(['page','components'])()
