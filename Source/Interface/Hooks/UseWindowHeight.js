import { useEffect } from 'react';

export function useWindowHeight(api, compact) {
	useEffect(() => {
		if (!api?.fitWindow) return;
		api.fitWindow(compact ? 620 : 820).catch(() => {});
	}, [api, compact]);
}
