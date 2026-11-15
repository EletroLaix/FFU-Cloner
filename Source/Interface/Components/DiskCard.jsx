import React from 'react';
import {
	HardDrive,
	Pencil,
	RefreshCw,
	LoaderCircle,
	LockKeyhole,
	Check,
	ShieldCheck
} from 'lucide-react';
import { unavailable, formatSize } from '../Helpers/Disks.mjs';

// Show disk eligibility and let the user select or refresh the available devices.
export default function DiskCard({
	t,
	mode,
	language,
	disk,
	disks,
	choosingDisk,
	loading,
	diskError,
	busy,
	confirm,
	onRefresh,
	onSelect,
	onChooseDisk
}) {
	const capture = mode === 'capture';
	const gb = (size) => formatSize(size, language);
	return (
		<section
			className={`card disk-card ${disk && !choosingDisk ? 'complete compact' : ''}`}
		>
			<div className="card-heading">
				<span className="step">{capture ? '01' : '02'}</span>
				<h2>{capture ? t('diskSource') : t('diskTarget')}</h2>
				{(!disk || choosingDisk) && (
					<button
						className="icon-button"
						onClick={onRefresh}
						disabled={busy || loading || confirm}
						aria-label={t('refreshDisks')}
						title={t('refreshDisks')}
					>
						<RefreshCw
							size={17}
							className={loading ? 'spin' : ''}
						/>
					</button>
				)}
			</div>
			{disk && !choosingDisk ? (
				<div className="selection-summary">
					<span className="summary-icon">
						<HardDrive size={23} />
					</span>
					<div>
						<strong>{disk.name}</strong>
						<span>
							{t('disk')} {disk.number} · {gb(disk.size)} GB · {disk.bus}
						</span>
						<small>S/N {disk.serial || disk.uniqueId}</small>
					</div>
					{!busy && (
						<button
							className="icon-button"
							onClick={onChooseDisk}
							disabled={confirm}
							title={t('changeDisk')}
							aria-label={t('changeDisk')}
						>
							<Pencil size={16} />
						</button>
					)}
				</div>
			) : (
				<div
					className="disk-list"
					role="radiogroup"
					aria-label={capture ? t('diskSource') : t('diskTarget')}
				>
					{loading ? (
						<div className="empty">
							<LoaderCircle
								size={30}
								className="spin"
							/>
							<span>{t('scanning')}</span>
						</div>
					) : disks.length === 0 ? (
						<div className="empty">
							<HardDrive size={32} />
							<strong>{t('noDisks')}</strong>
							<span>{diskError || t('connectDisk')}</span>
						</div>
					) : (
						[...disks]
							.sort(
								(a, b) =>
									Number(!!unavailable(a, mode)) -
										Number(!!unavailable(b, mode)) ||
									a.number - b.number
							)
							.map((item) => {
								const reasonKey = unavailable(item, mode);
								const reason = reasonKey ? t(reasonKey) : null;
								const selected = disk?.token === item.token;
								return (
									<button
										key={item.token}
										className={`disk ${selected ? 'selected' : ''}`}
										role="radio"
										aria-checked={selected}
										aria-label={`${item.name}, ${t('disk')} ${item.number}, ${gb(item.size)} GB${reason ? ', ' + reason : ''}`}
										disabled={!!reason || busy || confirm}
										onClick={() => onSelect(item)}
										title={
											reason ||
											`${t('serial')}: ${item.serial || t('notAvailable')}\nID: ${item.uniqueId}`
										}
									>
										<span className="disk-symbol">
											{reason ? (
												<LockKeyhole size={20} />
											) : (
												<HardDrive size={21} />
											)}
										</span>
										<span className="disk-description">
											<strong>{item.name}</strong>
											<span>
												{t('disk')} {item.number} <i />{' '}
												{gb(item.size)} GB <i /> {item.bus}
											</span>
											<small>
												{reason ||
													`S/N ${item.serial || t('notExposed')}`}
											</small>
										</span>
										<span className="radio-indicator">
											{selected && <Check size={12} />}
										</span>
									</button>
								);
							})
					)}
				</div>
			)}
			{(!disk || choosingDisk) && (
				<div className="card-foot">
					<ShieldCheck size={14} />
					<span>
						{disk
							? `${t('selectedDisk', { number: disk.number })} · ${disk.serial || disk.uniqueId}`
							: t('protectedDisks')}
					</span>
				</div>
			)}
		</section>
	);
}
