import { useEffect } from 'react';

// Request the compact or full window height when the workflow layout changes.
export function useWindowHeight(api, compact) {
	useEffect(() => {
		if (!api?.fitWindow) {
			return;
		}
		api.fitWindow(compact ? 512 : 721).catch(() => {});
	}, [api, compact]);
}
