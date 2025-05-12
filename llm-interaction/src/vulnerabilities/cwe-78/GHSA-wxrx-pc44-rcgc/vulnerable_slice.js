module.exports = ({
	moduleName = '',
	cwd = process.cwd(),
	registry = 'https://registry.npmjs.org/',
	beforeInstall = () => {}
} = {}) => {
	return new Promise(resolve => {

		const path = require('path')
		const fse = require('fs-extra')
		const cp = require('child_process')
		const getVersion = require('get-version-l')
		const { getInstalledPath, getInstalledPathSync } = require('get-installed-path')

		/**
	   * 同步写文件
	   *
	   * @param {string} filePath 文件路径
	   * @param {string} content 文件内容
	   */
		function writeFileSync (filePath, content) {
			fse.ensureFileSync(filePath)
			fse.writeFileSync(filePath, content)
		}

		/**
	   * 安装模块最新版本
	   *
	   */
		function installModule () {
			beforeInstall(cwd)
			let isPackagejsonExist = fse.pathExistsSync(path.join(cwd, 'package.json'))

			if (!isPackagejsonExist) {
				writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
					name: 'loading',
					version: '1.0.0',
				}))
			}

			try {
				cp.execSync(`npm install --registry ${registry} ${moduleName}@latest`, {cwd, stdio: 'inherit'})
			} catch (err) {
				throw new Error(err)
			}

			if (!isPackagejsonExist) {
				fse.removeSync(path.join(cwd, 'package.json'))
			}
		}

		/**
	   * 检查模块是否最新版本，不是的话安装最新版本
	   *
	   * @param {string} modulePath 模块所在路径
	   */
		function keepLatest (modulePath) {
			let latestVersion = getVersion(moduleName) + ''
			let currentVersion = require(path.join(modulePath, 'package.json')).version + ''

			if (latestVersion && latestVersion !== currentVersion) {
				console.log(`updating ${moduleName}...`)
				installModule()
				console.log(`updated ${moduleName}\n`)
			}
		}

		getInstalledPath(moduleName, {local: true, cwd})
			.catch(() => {
				// install if not exists
				console.log(`installing ${moduleName}...`)
				installModule()
				console.log(`installed ${moduleName}`)
				resolve(getInstalledPathSync(moduleName, { local: true, cwd }));
			})
			.then(modulePath => {
				// check for latest version
				keepLatest(modulePath)
				resolve(modulePath)
			})
	})
}
