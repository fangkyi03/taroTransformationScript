const fs = require('fs')
const { parseSync, transformFromAstSync, types, template, transformFromAstAsync } = require('@babel/core')
const traverse = require("@babel/traverse").default;
const prettier = require('prettier')
const p = require('path')

function getConnectString(dataSource) {
  if (dataSource.decorators[0].expression.arguments[0].params.length > 0) {
    if (dataSource.decorators[0].expression.arguments[0].params[0].properties.length > 0) {
      return dataSource.decorators[0].expression.arguments[0].params[0].properties[0].value.name
    }else {
      return ''
    }
  }else {
    return ''
  }
}
function parseBabel(str, filename) {
  return parseSync(str, {
    filename,
    presets: ["@babel/preset-react"],
    plugins: [
      [
        "@babel/plugin-proposal-decorators",
        {
          "legacy": true
        }
      ],
      [
        "@babel/plugin-proposal-class-properties",
        {
          "loose": true
        }
      ],
    ]
  })
}

function format(code) {
  return prettier.format(code, {
    "printWidth": 150,
    "tabWidth": 4,
    "useTabs": false,
    "semi": false,
    "singleQuote": false,
    "trailingComma": "none",
    "bracketSpacing": true,
    "jsxBracketSameLine": false,
    "parser": "babel"
  })
}

function readStrLine(str,start,end) {
  const split = str.split('\n')
  const startText = split[start.line - 1].substr(start.column)
  const body = Array(end.line - start.line).fill({}).map((e,i)=> split[start.line + i]).join('\n')
  return startText + body
}

function createExportDefault(filePath,str) {
  const formatStr = format('export default' + str)
  fs.writeFileSync(filePath.replace('/src',''), formatStr)
}

function buildApp({ str, targetPath,fileName}) {
  const ast = parseBabel(str, fileName)
  const reactTemplate = template('import React, { Component } from "react"')
  const expolerTemplate = template('export default %%name%%')
  traverse(ast,{
    ImportDeclaration(path) {
      if (path.node.source ) {
        if (path.node.source.value == '@tarojs/taro') {
          path.parent.body.unshift(reactTemplate())
          path.node.specifiers = path.node.specifiers.filter((e) => e.type == 'ImportDefaultSpecifier')
        } else if (path.node.source.value == '@tarojs/redux'){
          path.node.source.value = 'react-redux'
        }
      }
    },
    ExpressionStatement(path) {
      if (path.parent.body.length > 1) {
        path.remove()
      }
    },
    ClassProperty(path) {
      if (path.node.key.name == 'config') {
        const { start, end } = path.node.value.loc
        const text = readStrLine(str, start, end)
        createExportDefault(p.join(targetPath, '../../app.config.js'), text)
        path.remove()
      }
    },
    ClassDeclaration(path) {
      path.parent.body.push(expolerTemplate({ name: path.node.id.name }))
    }
  })
  const tranFormResult = transformFromAstSync(ast, str, { filename: fileName})
  const resultText = format(tranFormResult.code)
  return resultText
}

function buildPage({ str, dirName, filePath, targetPath, fileName, rootFile }) {
  const ast = parseBabel(str, fileName)
  const reactTemplate = template('import React, { Component } from "react"')
  const componentTemplate = template('Component')
  // const connectTemplate = template('export default connect({%%context%%}=>{%%context%%})(%%name%%)')
  const connectDefaultTemplate = template('export default connect({}=>{})(%%name%%)')
  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source) {
        if (path.node.source.value == '@tarojs/taro') {
          path.node.specifiers = path.node.specifiers.filter((e) => e.type == 'ImportDefaultSpecifier')
        } else if (path.node.source.value == '@tarojs/redux') {
          path.node.source.value = 'react-redux'
        }
      }
    },
    ExportDefaultDeclaration(path) {
      if (path.node.declaration.type == 'ClassDeclaration') {
        path.replaceWith(path.node.declaration)
      }
    },
    ClassProperty(path) {
      if (path.node.key.name == 'config') {
        const { start, end } = path.node.value.loc
        const text = readStrLine(str, start, end)
        createExportDefault(p.join(targetPath, '../index.config.js'), text)
        path.remove()
      }
    },
    ClassDeclaration(path, state) {
      const find = path.parent.body.find((e) => e.type == "ExportDefaultDeclaration")
      const findConnect = path.node.decorators && path.node.decorators[0].expression.callee.name == 'connect'
      if (findConnect) {
        let connectNode = null
        let conntentStr = getConnectString(path.node)
        let conntextStr
        if (conntentStr) {
          conntextStr = 'export default connect(({%%context%%})=>({...%%context%%}))(%%name%%)'.replace(/%%context%%/g, getConnectString(path.node))
        }else {
          conntextStr = 'export default connect(({})=>({}))(%%name%%)'
        }
        const connectTemplate = template(conntextStr)
        if (path.node.decorators[0].expression.arguments.length > 0 )  {
          connectNode = connectTemplate({
            name:path.node.id.name
          });
        }else {
          connectNode = connectDefaultTemplate({
            name: path.node.id.name
          });
        }
        // const text = readStrLine(str, path.node.decorators[0].loc.start, path.node.decorators[0].loc.end)
        const findIndex = path.parent.body.findIndex((e) => e.type == 'ExportDefaultDeclaration')
        if (findIndex > -1) {
          path.parent.body[findIndex] = connectNode
        }else {
          path.parent.body.push(connectNode)
        }
        path.node.decorators = []
      } else {
        const findIndex = path.parent.body.findIndex((e) => e.type == 'ExportDefaultDeclaration')
        if (findIndex > -1) {
          path.parent.body[findIndex] = types.exportDefaultDeclaration(types.identifier(path.node.id.name))
        }else {
          path.parent.body.push(types.exportDefaultDeclaration(types.identifier(path.node.id.name)))
        }
      }
    },
    MemberExpression(path) {
      const routerTemplate = template('Taro.getCurrentInstance().router')
      if (path.node.property.name == 'Component') {
        path.replaceWith(componentTemplate())
        if (path.parentPath.container) {
          path.parentPath.container.unshift(reactTemplate())
        } else {
          path.parentPath.parentPath.container.unshift(reactTemplate())
        }
      } else if (path.node.property.name == '$router'){
        path.replaceWith(routerTemplate())
      }
    }
  })
  const tranFormResult = transformFromAstSync(ast, str, { filename: fileName })
  let resultText = format(tranFormResult.code)
  fs.writeFileSync(targetPath, resultText)
  return resultText
}

module.exports = {
  buildApp,
  buildPage
}
