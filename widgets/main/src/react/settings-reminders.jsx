/* settings-reminders.jsx — секция «Уведомления» формы настроек (#112, admin-тир ⚖9; макет
   design/mirror/reminders/settings.html): мастер-выключатель, частота показа (Ring Radio),
   модули (Ring Toggle ×3 — по одобренному макету, не RoleCheck соседних секций), «за N дн.».
   Недоступный тумблер не прячется, а подсказывает, где включить: ёмкость — при
   capacityMode ≠ 'full' (это capacityMode, не planningModel), релизы — при выключенном модуле
   релизов. Значение недоступного тумблера сохраняется — сервер гейтит по доступности сам,
   включили модуль позже — напоминания заработали без повторного захода.
   Стейт — form-shape из pure/reminders-pure.js (settingsToForm/formToSettings — там же умолчания
   и клампы); без вендор-чанка Toggle падает на RoleCheck (Switch — settings-shared.jsx, с #120 общий). */

import * as React from 'react';
import { Switch } from './settings-shared.jsx';   /* #120 — Switch стал общим (тумблер фаз в «Релиз-менеджменте») */

function RemindersSection(props) {
  const t = props.t;
  const v = props.value;
  const set = props.onChange;
  const s = props.settings || {};
  const Radio = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Radio;
  const patch = (p) => set(Object.assign({}, v, p));
  const capOk = s.capacityMode === 'full';
  const relOk = s.releaseEnabled === true;
  const dim = v.enabled ? '' : ' ssp-subfields--dim';   /* #69 R1 (строка 6) — подполя при выключенном мастере притушены, не скрыты */

  return (
    <React.Fragment>
      <div className="ssp-reminders__group">
        <Switch on={v.enabled} label={t('remSetMaster')} onToggle={() => patch({ enabled: !v.enabled })} />
        <p className="ssp-reminders__desc">{t('remSetMasterHint')}</p>
      </div>

      <div className={'ssp-reminders__group' + dim}>
        <div className="ssp-reminders__group-title">{t('remSetFreqTitle')}</div>
        {Radio && Radio.Item
          ? (
            <Radio value={v.mode} onChange={(m) => patch({ mode: m === 'always' ? 'always' : 'daily' })}>
              <Radio.Item value="daily">{t('remSetFreqDaily')}</Radio.Item>
              <Radio.Item value="always">{t('remSetFreqAlways')}</Radio.Item>
            </Radio>
          )
          : null}
      </div>

      <div className={'ssp-reminders__group' + dim}>
        <div className="ssp-reminders__group-title">{t('remSetModulesTitle')}</div>
        <div className="ssp-reminders__row">
          <Switch on={v.sprints} label={t('remSetSprints')} onToggle={() => patch({ sprints: !v.sprints })} />
          <div><p className="ssp-reminders__desc">{t('remSetSprintsHint')}</p></div>
        </div>
        <div className="ssp-reminders__row">
          <Switch on={v.capacity} disabled={!capOk} label={t('remSetCapacity')}
                  title={capOk ? '' : t('remSetCapacityUnavailable')} onToggle={() => patch({ capacity: !v.capacity })} />
          <div>
            {capOk
              ? <p className="ssp-reminders__desc">{t('remSetCapacityHint')}</p>
              : <p className="ssp-reminders__help">{t('remSetCapacityUnavailable')}</p>}
            <div className="ssp-reminders__inline">
              <span>{t('remSetCapacityDaysPre')}</span>
              <input id="remCapacityDays" type="number" min={0} max={30} step={1} style={{ width: '72px' }}
                     aria-label={t('remSetCapacityDaysPre') + ' … ' + t('remSetCapacityDaysPost')}
                     value={v.days == null ? '' : v.days} onChange={(e) => patch({ days: e.target.value })} />
              <span>{t('remSetCapacityDaysPost')}</span>
            </div>
          </div>
        </div>
        <div className="ssp-reminders__row">
          <Switch on={v.releases} disabled={!relOk} label={t('remSetReleases')}
                  title={relOk ? '' : t('remSetReleasesUnavailable')} onToggle={() => patch({ releases: !v.releases })} />
          <div>
            {relOk
              ? <p className="ssp-reminders__desc">{t('remSetReleasesHint')}</p>
              : <p className="ssp-reminders__help">{t('remSetReleasesUnavailable')}</p>}
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

export { RemindersSection };
