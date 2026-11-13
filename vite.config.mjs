import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig({
	root: 'Source/Interface',
	base: './',
	publicDir: false,
	plugins: [
		{
			name: 'third-party-notices',
			generateBundle() {
				const notices = ['react', 'lucide-react']
					.map((name) =>
						readFileSync(new URL(`./node_modules/${name}/LICENSE`, import.meta.url), 'utf8')
					)
					.join('\n\n');
				this.emitFile({ type: 'asset', fileName: 'ThirdPartyNotices.txt', source: notices });
			}
		}
	],
	define: { __APP_VERSION__: JSON.stringify(version) },
	build: { outDir: '../../Output/Renderer', emptyOutDir: true }
});
