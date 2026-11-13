import { useEffect } from 'react';

// Use intrinsic content height, never the current window height, to avoid resize loops.
export function useWindowHeight(appElement, api, confirm) {
	useEffect(() => {
		if (!api?.fitWindow) return;
		const element = appElement.current;
		let frame, lastHeight;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const dialog = element.querySelector('.confirmation');
				const height = Math.ceil(
					Math.max(
						element.getBoundingClientRect().height,
						dialog ? dialog.getBoundingClientRect().height + 48 : 0
					)
				);
				if (height === lastHeight) return;
				lastHeight = height;
				api.fitWindow(height).catch(() => {});
			});
		});
		observer.observe(element);
		const dialog = element.querySelector('.confirmation');
		if (dialog) observer.observe(dialog);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [confirm]);
}
