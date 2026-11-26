import { setTutorialEnabled, tutorialEnabled } from '../tutorial';
import React from 'react';
import { useSettings } from '../app/hooks';
import { setSettings, type Settings } from '../state/settings';
import { canInstall, isStandalone, promptInstall } from '../pwa/register';
import { Icon } from './Icon';
import './menus.css';
import './settings.css';

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

type SetPage = 'som' | 'imagem' | 'jogo' | 'acesso';

/** Options as a game panel: four pages of big tiles, sliders and chunky choices — nothing scrolls. */
export function SettingsModal({ onClose }: { onClose(): void }) {
  const s = useSettings();
  const [page, setPage] = React.useState<SetPage>('som');
  const set = (p: Partial<Settings>) => setSettings(p);
  const slider = (k: keyof Settings, label: string, icon: string) => {
    const v = s[k] as number;
    const off = s.muted || v === 0;
    return (
      <div className={`st-slider ${off ? 'off' : ''}`}>
        <span className="st-slider-ic">
          <Icon id={icon} />
        </span>
        <span className="st-slider-l">{label}</span>
        <input
          className="m-range st-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={v}
          aria-label={label}
          style={{ '--p': `${v * 100}%` } as React.CSSProperties}
          onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Settings>)}
        />
        <b className="st-val">{Math.round(v * 100)}</b>
      </div>
    );
  };
  const seg = <T extends string | number>(k: keyof Settings, label: string, icon: string, opts: [T, string][]) => (
    <div className="st-seg">
      <div className="st-seg-l">
        <Icon id={icon} /> {label}
      </div>
      <div className="st-seg-row" role="radiogroup" aria-label={label}>
        {opts.map(([v, l]) => (
          <button key={String(v)} role="radio" aria-checked={s[k] === v} className={s[k] === v ? 'on' : ''} onClick={() => set({ [k]: v } as Partial<Settings>)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const toggle = (k: keyof Settings, label: string, icon: string, hint?: string) => <Tile key={String(k)} on={!!s[k]} label={label} icon={icon} hint={hint} onClick={() => set({ [k]: !s[k] } as Partial<Settings>)} />;
  const pages: [SetPage, string, string][] = [
    ['som', 'Som', s.muted ? 'sound_off' : 'sound_on'],
    ['imagem', 'Imagem', 'settings'],
    ['jogo', 'Jogo', 'dice_d12'],
    ['acesso', 'Acesso', 'mira'],
  ];
  return (
    <Sheet
      title="Configurações"
      onClose={onClose}
      wide
      label="Configurações"
      foot={
        <button className="k-cta" onClick={onClose}>
          Pronto
        </button>
      }
    >
      <div className="st">
        <div className="st-tabs" role="tablist" aria-label="Seções">
          {pages.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={page === k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>
              <Icon id={ic} />
              <span>{l}</span>
            </button>
          ))}
        </div>
        <div className="st-page" key={page}>
          {page === 'som' && (
            <>
              <div className="st-tiles one">{toggle('muted', 'Silenciar tudo', s.muted ? 'sound_off' : 'sound_on')}</div>
              <div className="st-sliders">
                {slider('master', 'Geral', 'sound_on')}
                {slider('music', 'Música', 'music')}
                {slider('sfx', 'Efeitos', 'act_attack_melee')}
                {slider('ambience', 'Ambiente', 'loc_claustro')}
              </div>
            </>
          )}
          {page === 'imagem' && (
            <div className="st-segs">
              {seg('quality', 'Qualidade', 'settings', [
                ['auto', 'Auto'],
                ['low', 'Baixa'],
                ['medium', 'Média'],
                ['high', 'Alta'],
              ])}
              {seg('uiScale', 'Tamanho da interface', 'act_buff', [
                [0.85, 'P'],
                [1, 'M'],
                [1.15, 'G'],
                [1.3, 'GG'],
              ])}
              {seg('animSpeed', 'Velocidade das animações', 'fast_forward', [
                [1, '1×'],
                [1.5, '1,5×'],
                [2, '2×'],
                [3, '3×'],
              ])}
            </div>
          )}
          {page === 'jogo' && (
            <div className="st-tiles">
              <TutorialSwitch />
              {toggle('autoTieBreak', 'Desempate automático', 'dice_d12', 'Sem perguntar nos empates')}
              {toggle('askImpulse', 'Escolher Impulsos', 'impulse', 'Senão o jogo escolhe')}
              {toggle('subtitles', 'Legendas', 'info', 'Texto dos sons')}
            </div>
          )}
          {page === 'acesso' && (
            <div className="st-tiles">
              {toggle('reducedMotion', 'Reduzir movimento', 'tempo_pesado', 'Menos animação')}
              {toggle('highContrast', 'Alto contraste', 'mira', 'Cores mais fortes')}
              {toggle('showPerf', 'Desempenho', 'log', 'FPS na tela')}
              {canInstall() && !isStandalone() && <Tile on={false} label="Instalar o jogo" icon="load" hint="Joga offline" onClick={() => void promptInstall()} action />}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** A big on/off tile: icon, label, tiny hint, and a lamp that lights when on. */
function Tile({ on, label, icon, hint, onClick, action }: { on: boolean; label: string; icon: string; hint?: string; onClick(): void; action?: boolean }) {
  return (
    <button role={action ? undefined : 'switch'} aria-checked={action ? undefined : on} aria-label={label} className={`st-tile ${on ? 'on' : ''} ${action ? 'act' : ''}`} onClick={onClick}>
      <span className="st-tile-ic">
        <Icon id={icon} />
      </span>
      <span className="st-tile-l">{label}</span>
      {hint && <small>{hint}</small>}
      {!action && (
        <span className="st-lamp" aria-hidden>
          {on ? 'Ligado' : 'Desligado'}
        </span>
      )}
    </button>
  );
}

/** The interactive tutorial lives outside the Settings object (per device progress in the tutorial module). */
function TutorialSwitch() {
  const [on, setOn] = React.useState(tutorialEnabled);
  return (
    <Tile
      on={on}
      label="Tutorial interativo"
      icon="info"
      hint="O mentor ensina"
      onClick={() => {
        setTutorialEnabled(!on);
        setOn(!on);
      }}
    />
  );
}
