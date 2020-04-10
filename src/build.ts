import * as fs from "fs"
import * as path from "path"
import * as uglify from "uglify-js"
import { parse } from 'node-html-parser';
import CleanCSS = require("clean-css")

export namespace X {
    let C = {
        PATH_TEMP:"temp",
        PATH_SRC:"build/web-mobile",
        PATH_OUT:"build/playable-ads", //./playable-ads/
        INDEX_FILE_NAME:"index.html",
        RES_FILE_NAME:"res.js", //  ./playable-ads/res.js

        RES_BASE64_EXTNAME_SET: new Set([ //base64 all res folder -> add to index.html
            ".png", ".jpg", ".webp", ".mp3",
        ]),
        RES_PATH: new Set([
            'res'
        ])
    };
    let res_object = {};

    /**
     *
     * @param str
     * @return {HTMLElement}
     */
    function getHtml(str:string) {
        return parse(str,{
            lowerCaseTagName: false,  // convert tag name to lower case (hurt performance heavily)
            script: true,            // retrieve content in <script> (hurt performance slightly)
            style: true,             // retrieve content in <style> (hurt performance slightly)
            pre: true,               // retrieve content in <pre> (hurt performance slightly)
            comment: true            // retrieve comments (hurt performance slightly)
        })
    }
    /**
     * 读取文件内容
     * - 特定后缀返回base64编码后字符串,否则直接返回文件内容字符串
     * @param filepath
     */
    function get_file_content(filepath: string): string {
        let file = fs.readFileSync(filepath);
        return C.RES_BASE64_EXTNAME_SET.has(path.extname(filepath)) ? file.toString("base64") : file.toString()
    }

    function updateContentChild(parent,rootPath:string) {
        let len = parent.childNodes.length;
        for (let i = 0; i < len; i++) {
            let child = parent.childNodes[i];
            //1. update css
            if(child.tagName == 'link'){
                /** @type {HTMLElement}*/
                let link = child;
                let type = link.getAttribute("type");
                let href = link.getAttribute("href");
                if(type == 'text/css'){
                    let pathcss = `${rootPath}/${href}`;
                    if(fs.statSync(pathcss).isFile()){
                        let css = fs.readFileSync(pathcss);
                        let newContent = '<style>'+css.toString()+'</style>';
                        // @ts-ignore
                        parent.exchangeChild(link,getHtml(newContent));
                        continue;
                    }
                }
            }

            //2. update javascript
            if(child.tagName == 'script'){
                /** @type {HTMLElement}*/
                let element = child;
                let src = element.getAttribute("src");
                if(src && src != ''){
                    let pathJS = `${rootPath}/${src}`;
                    if(fs.statSync(pathJS).isFile()){
                        let js = fs.readFileSync(pathJS);
                        let newContent = '<script type="text/javascript" charset="utf-8">'+js.toString()+'</script>';
                        // @ts-ignore
                        parent.exchangeChild(element,getHtml(newContent));
                        continue;
                    }
                }
            }


            updateContentChild(child,rootPath);

        }
    }
    /**
     * @param filepath
     */
    function get_all_child_file(filepath: string): string[] {
        let children = [filepath];
        for (; ;) {
            if (children.every(v => fs.statSync(v).isFile())) { break }
            children.forEach((child, i) => {
                if (fs.statSync(child).isDirectory()) {
                    delete children[i];
                    let child_children = fs.readdirSync(child).map(v => `${child}/${v}`);
                    children.push(...child_children)
                }
            })
        }
        return children
    }
    function addToResFile(PATH_SRC: string, name: string) {
        let src = `${PATH_SRC}/${name}`;
        get_all_child_file(src).forEach(path => {
            // 注意,存储时删除BASE_PATH前置
            let store_path = path.replace(new RegExp(`^${PATH_SRC}/`), "")
            res_object[store_path] = get_file_content(path)
        });
    }

    function copyAllToDest(PATH_SRC: string, name: string, PATH_OUT: string) {
        let src = `${PATH_SRC}/${name}`;
        let dst = `${PATH_OUT}/${name}`;
        if(C.RES_PATH.has(name)){
            addToResFile(PATH_SRC,name);
            return;
        }
        if(fs.statSync(src).isFile()){
            console.log("copy:" + src +"->" + dst);
            let data = fs.readFileSync(src);
            fs.writeFileSync(dst,data);
        }else{
            fs.readdirSync(src).map(v => {
                if(C.RES_PATH.has(v)){ //neu la folder res path -> add to res.js
                    //add res.js file
                    addToResFile(PATH_SRC,`${name}/${v}`);
                }else{
                    if(!fs.existsSync(`${PATH_OUT}/${name}`)){
                        fs.mkdirSync(`${PATH_OUT}/${name}`);//tao folder moi
                    }
                    copyAllToDest(PATH_SRC,`${name}/${v}`,PATH_OUT);
                }
            });
        }
    }

    function writeResFile() {
        console.log(">Write res file.");
        fs.writeFileSync(`${C.PATH_OUT}/${C.RES_FILE_NAME}`,`window.resMap=${JSON.stringify(res_object)}`); //clear data res.js
        console.log(">Write res file done.");
    }

    function clearResFile() {
        console.log('>Init res file.');
        res_object ={};
        fs.writeFileSync(`${C.PATH_OUT}/${C.RES_FILE_NAME}`,''); //clear data res.js
        console.log('>Init res file done.');
    }

    function addScriptToBody(body,fileName){
        let path = `${C.PATH_SRC}/${fileName}`;
        if(fs.existsSync(path) && fs.statSync(path).isFile()){
            body.appendChild(parse('<script src="' + fileName + '" charset="utf-8"></script>'));
        }else{
            console.log("missing file:" + fileName);
        }
    }
    function writeIndexHtml() {
        //1. get index.html
        console.log(">Write index.html.");
        let filepath = `${C.PATH_SRC}/index.html`;
        let filepathout = `${C.PATH_OUT}/index.html`;
        if(fs.statSync(filepath).isFile()){
            let indexFile =  fs.readFileSync(filepath);
            let html = getHtml(indexFile.toString());

            // @ts-ignore
            let bodys = html.querySelectorAll("body");
            if(bodys.length > 0){
                let body = bodys[0];
                //xoa tat ca cac tag script
                let scipts = body.querySelectorAll("script");
                for (let s = 0; s < scipts.length; s++) {
                    body.removeChild(scipts[s]);
                }

                //add tag script
                body.appendChild(parse('<script src="' + C.RES_FILE_NAME + '" charset="utf-8"></script>\n'));
                addScriptToBody(body,"src/settings.js");
                addScriptToBody(body,"cocos2d-js-min.js");
                addScriptToBody(body,"cocos2d-js.js");
                addScriptToBody(body,"physics-min.js");
                addScriptToBody(body,"vconsole.min.js");
                addScriptToBody(body,"src/project.js");
                addScriptToBody(body,"src/project.dev.js");
                addScriptToBody(body,"main.js");
            }

            // @ts-ignore
            html.removeWhitespace();

            // console.log(html.toString());
            fs.writeFileSync(filepathout, html.toString());
        }else{
            console.error("can't file index.html:" + filepath);
        }
        console.log(">Write index.html done.");
    }

    function writeMainJS() {
        console.log(">Write main.js.");
        let src = `${C.PATH_TEMP}/main.js`;
        let dst = `${C.PATH_OUT}/main.js`;
        console.log("Copy temp main.js:" + src +"->" + dst);
        let data = fs.readFileSync(src);
        fs.writeFileSync(dst, data);
        console.log(">Write main.js done.");
    }
    function ensureDirectoryExistence(filePath) {
        console.log('>Make Output path done');
        if (fs.existsSync(filePath)) {
            return true;
        }else{
            fs.mkdirSync(filePath);
            ensureDirectoryExistence(filePath);
        }
        console.log('>Make Output path done');
    }
    function clearOutPath() {
        console.log('>.Clear Output path.');
        const fs = require('fs');
        const Path = require('path');

        const deleteFolderRecursive = function(path) {
            if (fs.existsSync(path)) {
                fs.readdirSync(path).forEach((file, index) => {
                    const curPath = Path.join(path, file);
                    if (fs.lstatSync(curPath).isDirectory()) { // recurse
                        deleteFolderRecursive(curPath);
                    } else { // delete file
                        fs.unlinkSync(curPath);
                    }
                });
                fs.rmdirSync(path);
            }
        };
        deleteFolderRecursive(C.PATH_OUT);
        console.log('>.Clear Output path done.');
    }

    function makeZip() {
        console.log('>.makeZip.');
        var fs = require('fs');
        var archiver = require('archiver');
        // create a file to stream archive data to.
        var output = fs.createWriteStream(`${C.PATH_OUT}/../playable-ads.zip`);
        var archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });
        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function() {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
        });

        // This event is fired when the data source is drained no matter what was the data source.
        // It is not part of this library but rather from the NodeJS Stream API.
        // @see: https://nodejs.org/api/stream.html#stream_event_end
        output.on('end', function() {
            console.log('Data has been drained');
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function(err) {
            if (err.code === 'ENOENT') {
                // log warning
            } else {
                // throw error
                throw err;
            }
        });

        // good practice to catch this error explicitly
        archive.on('error', function(err) {
            throw err;
        });

        // pipe archive data to the file
        archive.pipe(output);
        // append files from a sub-directory, putting its contents at the root of archive

        archive.directory(C.PATH_OUT, false);

        // finalize the archive (ie we are done appending files but streams have to finish yet)
        // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
        archive.finalize();
        console.log('>.makeZip done.');
    }
    export function do_task() {
        //0. check error
        //1. copy file to dest_path
        //2. add res to index.html
        //3. zip file

        let project_path = process.argv[2];
        if(project_path){
            if(fs.existsSync(project_path)){
                if(fs.statSync(project_path).isDirectory()){
                    C.PATH_OUT = `${project_path}/${C.PATH_OUT}`;
                    C.PATH_SRC = `${project_path}/${C.PATH_SRC}`
                }
            }
        }
        //0. check error
        console.log('>. Check error.');
        if(!fs.existsSync(C.PATH_SRC) || !fs.statSync(C.PATH_SRC).isDirectory()){
            console.error("src not found or not is dir:" + C.PATH_SRC);
            return;
        }
        if(!fs.existsSync(`${C.PATH_SRC}/${C.INDEX_FILE_NAME}`) ||  !fs.statSync(`${C.PATH_SRC}/${C.INDEX_FILE_NAME}`).isFile()){
            console.error("index.html not found:" + C.PATH_SRC);
            return;
        }
        console.log('>. Check error done.');

        //end check error

        //1. copy file to dest_path
        //2. add res to index.html
        //3. zip file
        clearOutPath();
        ensureDirectoryExistence(C.PATH_OUT);
        clearResFile();

        console.log(">Copy all file to dest.");
        fs.readdirSync(C.PATH_SRC).map(v => {
            if(v != C.INDEX_FILE_NAME){
                copyAllToDest(C.PATH_SRC,v,C.PATH_OUT);
            }
        });
        console.log(">Copy all file to dest done.");

        writeResFile();
        writeIndexHtml(); //remove all script tag => add tag custom
        writeMainJS(); //ghi de template main.js
        makeZip();
    }
}
X.do_task();