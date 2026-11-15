import React from 'react';
import { FileImage, Pencil, Plus, ArrowUpRight } from 'lucide-react';

// Display the selected FFU file and the native file picker action.
export default function ImageCard({ t, mode, image, busy, confirm, available, onPick }) {
	const capture = mode === 'capture';
	return (
		<section className={`card image-card ${image ? 'complete compact' : ''}`}>
			<div className="card-heading">
				<span className="step">{capture ? '02' : '01'}</span>
				<h2>{capture ? t('imageOutput') : t('imageSource')}</h2>
			</div>
			{image ? (
				<div className="selection-summary">
					<span className="summary-icon">
						<FileImage size={23} />
					</span>
					<div>
						<strong>{image.name}</strong>
						<span title={image.path}>{image.path}</span>
					</div>
					{!busy && (
						<button
							className="icon-button"
							onClick={onPick}
							disabled={confirm}
							title={t('changeFile')}
							aria-label={t('changeFile')}
						>
							<Pencil size={16} />
						</button>
					)}
				</div>
			) : (
				<button
					data-testid="pick-image"
					className="image-picker"
					onClick={onPick}
					disabled={busy || confirm || !available}
					aria-label={capture ? t('pickSaveLabel') : t('pickOpenLabel')}
				>
					<span className="image-symbol">
						<FileImage size={36} />
					</span>
					<strong>{capture ? t('chooseOutput') : t('chooseImage')}</strong>
					<span className="image-description">
						{capture ? t('outputDescription') : t('imageDescription')}
					</span>
					<span className="picker-action">
						<Plus size={16} />
						{capture ? t('chooseLocation') : t('chooseFile')}
						<ArrowUpRight size={14} />
					</span>
				</button>
			)}
			{!image && (
				<div className="card-foot">
					<FileImage size={13} />
					<span>
						Full Flash Update <i /> .ffu
					</span>
				</div>
			)}
		</section>
	);
}
