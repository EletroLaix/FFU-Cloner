import { useEffect } from 'react';

export function useWindowHeight(api, compact) {
	useEffect(() => {
		if (!api?.fitWindow) return;
		api.fitWindow(compact ? 512 : 721).catch(() => {});
	}, [api, compact]);
}
