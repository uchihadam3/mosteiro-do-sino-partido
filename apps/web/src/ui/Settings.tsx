import { setTutorialEnabled, tutorialEnabled } from '../tutorial';
import React from 'react';
import { useSettings } from '../app/hooks';
import { setSettings, type Settings } from '../state/settings';
import { canInstall, isStandalone, promptInstall } from '../pwa/register';
import { Icon } from './Icon';
import './menus.css';

/** Bottom sheet (centered dialog on PC) shared by the menus: grab handle, title row with close, scrolling body, optional footer. */
export function Sheet({
  kicker,
  title,
  onClose,
  children,
  foot,
  wide,
  label,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  onClose?(): void;
  children: React.ReactNode;
  foot?: React.ReactNode;
  wide?: boolean;
  label?: string;
}) {
  return (
    <div className="k-sheet-back" onClick={onClose}>
      <div className={`k-sheet m-sheet ${wide ? 'wide' : ''}`} role="dialog" aria-label={label ?? (typeof title === 'string' ? title : undefined)} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="m-sheet-head">
          <div className="grow">
            {kicker && <div className="k-kicker">{kicker}</div>}
            <h2 className="m-sheet-title">{title}</h2>
          </div>
          {onClose && (
            <button className="k-round" onClick={onClose} aria-label="Fechar">
              <Icon id="close" />
            </button>
          )}
        </div>
        <div className="m-sheet-body">{children}</div>
        {foot && <div className="m-sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose(): void }) {
  const s = useSettings();
  const set = (p: Partial<Settings>) => setSettings(p);
  const slider = (k: keyof Settings, label: string, icon: string) => {
    const v = s[k] as number;
    return (
      <div className="m-set-row col">
        <div className="top">
          <Icon id={icon} />
          <span className="l">{label}</span>
          <span className="val">{Math.round(v * 100)}%</span>
        </div>
        <input
          className="m-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={v}
          aria-label={label}
          style={{ '--p': `${v * 100}%` } as React.CSSProperties}
          onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Settings>)}
        />
      </div>
    );
  };
  const seg = <T extends string | number>(k: keyof Settings, label: string, icon: string, opts: [T, string][]) => (
    <div className="m-set-row col">
      <div className="top">
        <Icon id={icon} />
        <span className="l">{label}</span>
      </div>
      <div className="m-seg" role="radiogroup" aria-label={label}>
        {opts.map(([v, l]) => (
          <button key={String(v)} role="radio" aria-checked={s[k] === v} className={s[k] === v ? 'on' : ''} onClick={() => set({ [k]: v } as Partial<Settings>)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const toggle = (k: keyof Settings, label: string, icon: string, hint?: string) => (
    <div className="m-set-row">
      <Icon id={icon} />
      <span className="l">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button role="switch" aria-checked={!!s[k]} aria-label={label} className={`m-switch ${s[k] ? 'on' : ''}`} onClick={() => set({ [k]: !s[k] } as Partial<Settings>)} />
    </div>
  );
  return (
    <Sheet title="Configurações" onClose={onClose} wide foot={<button className="k-cta" onClick={onClose}>Pronto</button>}>
      <div className="m-set-cols">
        <div className="m-set-group">
          <div className="k-section">Som</div>
          <div className="m-set-card">
            {toggle('muted', 'Silenciar tudo', s.muted ? 'sound_off' : 'sound_on')}
            {slider('master', 'Volume geral', 'sound_on')}
            {slider('music', 'Música', 'music')}
            {slider('sfx', 'Efeitos', 'act_attack_melee')}
            {slider('ambience', 'Ambiência', 'loc_claustro')}
            {toggle('subtitles', 'Legendas de áudio', 'info')}
            <TutorialSwitch />
          </div>
        </div>
        <div className="m-set-group">
          <div className="k-section">Imagem e jogo</div>
          <div className="m-set-card">
            {seg('quality', 'Qualidade gráfica', 'settings', [['auto', 'Auto'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']])}
            {seg('animSpeed', 'Velocidade das animações', 'fast_forward', [[1, '1×'], [1.5, '1,5×'], [2, '2×'], [3, '3×']])}
            {seg('uiScale', 'Tamanho da interface', 'act_buff', [[0.85, 'P'], [1, 'M'], [1.15, 'G'], [1.3, 'GG']])}
          </div>
          <div className="k-section">Acessibilidade</div>
          <div className="m-set-card">
            {toggle('reducedMotion', 'Reduzir movimento', 'tempo_pesado')}
            {toggle('highContrast', 'Alto contraste', 'mira')}
            {toggle('autoTieBreak', 'Desempate automático', 'dice_d12', 'Empates do Alvo Padrão sem perguntar')}
            {toggle('showPerf', 'Painel de desempenho', 'log', 'FPS e draw calls')}
          </div>
        </div>
      </div>
      {canInstall() && !isStandalone() && (
        <button className="m-rowbtn" style={{ marginTop: 14 }} onClick={() => void promptInstall()}>
          <span className="m-ico-disc">
            <Icon id="load" />
          </span>
          <span className="lbl">
            Instalar o jogo
            <span className="sub">Funciona offline e se atualiza sozinho</span>
          </span>
        </button>
      )}
    </Sheet>
  );
}

/** The interactive tutorial lives outside the Settings object (per device progress in the tutorial module). */
function TutorialSwitch() {
  const [on, setOn] = React.useState(tutorialEnabled);
  return (
    <div className="m-set-row">
      <Icon id="info" />
      <span className="l">
        Tutorial interativo
        <small>O mentor mostra o que fazer, passo a passo</small>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Tutorial interativo"
        className={`m-switch ${on ? 'on' : ''}`}
        onClick={() => {
          setTutorialEnabled(!on);
          setOn(!on);
        }}
      />
    </div>
  );
}
