import { t } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import Image from 'next/image';
import AnalyticsConsentSwitch from './AnalyticsConsentSwitch';

export function About() {
    const [currentVersion, setCurrentVersion] = useState('1.0.0');

    useEffect(() => {
        getVersion().then(setCurrentVersion).catch(console.error);
    }, []);

    return (
        <div className="p-4 space-y-4 h-[80vh] overflow-y-auto">
            <div className="text-center">
                <Image
                    src="/icon_128x128.png"
                    alt={t('Secretary Mee Logo')}
                    width={72}
                    height={72}
                    className="mx-auto mb-3 rounded-2xl"
                />
                <h1 className="text-xl font-bold text-gray-900">Secretary Mee</h1>
                <span className="text-sm text-gray-500">{t('v')}{currentVersion}</span>
                <p className="text-medium text-gray-600 mt-1">
                    {t('Real-time notes and summaries that never leave your machine.')}
                </p>
            </div>

            <div className="space-y-3">
                <h2 className="text-base font-semibold text-gray-800">{t('What makes Secretary Mee different')}</h2>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('Privacy-first')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('Your data & AI processing workflow can now stay within your premise. No cloud, no leaks.')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('Use Any Model')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('Prefer local open-source model? Great. Want to plug in an external API? Also fine. No lock-in.')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('Cost-Smart')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('Avoid pay-per-minute bills by running models locally (or pay only for the calls you choose).')}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                        <h3 className="font-bold text-sm text-gray-900 mb-1">{t('Works everywhere')}</h3>
                        <p className="text-xs text-gray-600 leading-relaxed">{t('Google Meet, Zoom, Teams-online or offline.')}</p>
                    </div>
                </div>
            </div>

            <AnalyticsConsentSwitch />
        </div>
    );
}
