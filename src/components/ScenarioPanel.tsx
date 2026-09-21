import { useEffect, useRef } from 'react'
import { CHAT_HINTS } from '@/chat'
import { AXES, AX_OWN, AX_STYLE, AXCAT, PRESETS, DEF, SCREEN_NAMES, TITLES, MODALS, ICON_PACKS, iconSample, FONTS } from '@/legacy/prototype'
import { useApp } from '@/state/store'
import type { Scenario, Ui } from '@/state/types'

type Key = keyof Scenario

const TABS: [NonNullable<Ui['sctab']>, string][] = [
  ['ax', 'Оси'], ['sty', 'Стиль'], ['sets', 'Наборы'], ['go', 'Переходы'], ['chat', 'Чат'],
]
/* Оси оформления живут на своей вкладке — в списке состояний продукта им не место */
const STY = (k: string) => AX_STYLE.has(k)
/* Ширины панели кнопками. Первая — значение по умолчанию из freshUi: иначе
   ни одна кнопка не подсвечена, пока её не нажали. Между ними ширина тянется
   за край мышью, поэтому кнопка может быть не подсвечена ни одна. */
const WIDTHS = [420, 560, 760]
/* Меньше 360 панель не читается, шире 900 закрывает прототип целиком */
const fitWidth = (w: number) =>
  Math.round(Math.max(360, Math.min(w, Math.min(900, window.innerWidth - 80))))

/** У пяти окон заголовок пустой или считается от строки таблицы — им нужны свои подписи. */
const MODAL_NAMES: Record<string, string> = {
  noteinfo: 'Уведомление', gdel: 'Удалить группу', tdel: 'Удалить тег',
  levels: 'Уровни комиссии', acctdel: 'Удаление аккаунта',
}
/** Все модалки прототипа списком: любую можно открыть поверх текущего экрана. */
const modalList = () => Object.keys(MODALS)
  .map((k) => {
    const t = MODALS[k].t
    return [k, MODAL_NAMES[k] || (typeof t === 'function' ? '' : t) || k] as [string, string]
  })
  .sort((a, b) => a[1].localeCompare(b[1], 'ru'))

/** Панель сценариев: состояние прототипа в ссылке. Клавиша S открывает и закрывает. */
export function ScenarioPanel() {
  const { S, U, route, panel, modal, patchUi } = useApp()
  /* Ширина тянется за край: запоминаем, откуда начали, и считаем от этого —
     иначе на быстром движении курсор убегает от края панели. */
  const drag = useRef<{ x: number; w: number } | null>(null)
  const box = useRef<HTMLElement>(null)
  const q = (U.scq || '').trim().toLowerCase()
  const hit = (s: string) => !q || s.toLowerCase().includes(q)

  const keys = Object.keys(AXES) as Key[]
  /* Оси, уведённые от значения по умолчанию — их подсвечиваем и считаем.
     Считаем отдельно: список «Осей» оформление не показывает, и фильтр
     «Изменённые» с общим счётчиком приводил в пустой список. */
  const changed = keys.filter((k) => S[k] !== DEF[k])
  const changedAx = changed.filter((k) => !STY(k))
  const changedSty = changed.filter(STY)
  const pins = (U.scpin || []).filter((k) => k in AXES) as Key[]
  const tab = U.sctab || 'ax'
  const onlyDirty = !!U.scdirty
  const onlyPin = !!U.sconly
  /* Оси без кадра в макетах помечаем: их придумали при сборке панели */
  const onlyFigma = !!U.scfig
  const own = keys.filter((k) => AX_OWN.has(k))
  const saved = U.saved || []
  const hist = U.schist || []
  const width = U.scw || 420
  const collapsed = U.scgrp || []

  /* Узкое окно: сохранённая ширина может не влезть — подрезаем на месте,
     иначе панель закрывает прототип целиком. */
  useEffect(() => {
    const fit = () => { const w = U.scw || 420; if (w !== fitWidth(w)) patchUi({ scw: fitWidth(w) }) }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  })

  /* Панель ведёт себя как диалог: открылась — фокус внутрь, закрылась —
     обратно на кнопку. Закрытая помечается inert, иначе в неё уезжает Tab. */
  useEffect(() => {
    if (panel) box.current?.focus({ preventScroll: true })
    else if (box.current?.contains(document.activeElement)) {
      (document.querySelector('.sct') as HTMLElement | null)?.focus({ preventScroll: true })
    }
  }, [panel])

  /* Ось попадает в список, если подходит под поиск и под активные фильтры */
  const visible = (k: Key) =>
    !STY(k) &&
    (!onlyDirty || S[k] !== DEF[k]) &&
    (!onlyPin || pins.includes(k)) &&
    (!onlyFigma || !AX_OWN.has(k)) &&
    (hit(AXES[k].label) || hit(AXES[k].g) || hit(AXES[k].note || '') ||
      AXES[k].opts.some(([, t]) => hit(t)))

  const screens = Object.entries(TITLES)
    .map(([id, t]) => [id, SCREEN_NAMES[id] || t] as [string, string])
    .filter(([, t]) => hit(t))
  const modals = modalList().filter(([, t]) => hit(t))

  const valOf = (k: Key) => (AXES[k].opts.find(([v]) => v === S[k]) || ['', S[k]])[1]

  /* На вкладке «Стиль» поиск раньше не делал ничего: ищем по названию оси,
     пояснению, подписям значений — а у шрифтов и наборов иконок ещё и по
     их собственным именам. */
  const hitAxis = (k: Key) =>
    hit(AXES[k].label) || hit(AXES[k].note || '') || AXES[k].opts.some(([, t]) => hit(t))
  const fonts = AXES.font.opts.filter(([v, t]: [string, string]) => hitAxis('font') || hit(t) || hit(FONTS[v].name))
  const accents = AXES.accent.opts.filter(([, t]: [string, string]) => hitAxis('accent') || hit(t))
  const packs = ICON_PACKS.filter(([, name, note]: [string, string, string]) =>
    hitAxis('icons') || hit(name) || hit(note))
  const styRows = (['radius', 'space'] as Key[]).filter(hitAxis)
  const styEmpty = !fonts.length && !accents.length && !packs.length && !styRows.length

  const axisRow = (k: Key) => (
    <div className={`scg ${S[k] !== DEF[k] ? 'dirty' : ''}`} key={k}>
      <label>
        <span className="scl">{AXES[k].label}</span>
        {AX_OWN.has(k) && !STY(k) && (
          <i className="scown" title="Оси нет в макетах — придумана при сборке панели">своё</i>
        )}
        {!STY(k) && (
          <button
            className={`scpin ${pins.includes(k) ? 'on' : ''}`}
            data-scpin={k}
            title={pins.includes(k) ? 'Открепить' : 'Закрепить наверху'}
          >★</button>
        )}
        {S[k] !== DEF[k] && (
          <button className="scundo" data-axreset={k} title="Вернуть значение по умолчанию">↺</button>
        )}
      </label>
      {AXES[k].note && <p className="scdesc">{AXES[k].note}</p>}
      <div className="sco">
        {AXES[k].opts.map(([v, t]) => (
          <button data-axis={k} data-val={v} className={S[k] === v ? 'on' : ''}
            aria-pressed={S[k] === v} key={v}>{t}</button>
        ))}
      </div>
    </div>
  )

  const groupSection = (g: string) => {
    const inGroup = keys.filter((k) => AXES[k].g === g).filter(visible)
    if (!inGroup.length) return null
    const off = collapsed.includes(g)
    const dirty = inGroup.filter((k) => S[k] !== DEF[k]).length
    return (
      <section className="scsec" key={g}>
        <div className="scshead">
          <button className={`scsect ${off ? 'off' : ''}`} data-scgrp={g}>
            <span className="scarr">{off ? '▸' : '▾'}</span>
            {g}
            <span className="scqty">{inGroup.length}</span>
            {dirty > 0 && <span className="scnum">{dirty}</span>}
          </button>
          <button className="scmini" data-grprand={g} title="Случайные значения в группе">⟳</button>
          <button className="scmini" data-grpreset={g} title="Сбросить группу" disabled={!dirty}>↺</button>
        </div>
        {!off && inGroup.map(axisRow)}
      </section>
    )
  }

  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    patchUi({ scw: fitWidth(drag.current.w + (U.scside === 'left' ? dx : -dx)) })
  }
  const drop = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <>
      <button className="sct" data-panel>
        ⚙ Сценарии{changed.length > 0 && <span className="bdg">{changed.length}</span>}
      </button>
      {/* Затемнение под панелью: клик по нему закрывает. При открытой модалке
          не рисуем — у неё своя маска, и вторая только гасила бы окно. */}
      <div className={`scmask ${panel && !modal && U.tour == null ? 'on' : ''}`} data-panel aria-hidden="true" />
      <aside
        ref={box}
        className={`sc ${panel ? 'open' : ''} ${U.scside === 'left' ? 'dockl' : ''}`}
        style={{ width }}
        role="dialog"
        aria-modal={!modal}
        aria-label="Сценарии — состояние прототипа"
        tabIndex={-1}
        inert={!panel}
      >
        <div
          className="scgrip"
          onPointerDown={grab}
          onPointerMove={move}
          onPointerUp={drop}
          onPointerCancel={drop}
          onDoubleClick={() => patchUi({ scw: WIDTHS[0] })}
          title="Потяните, чтобы изменить ширину. Двойной клик — вернуть 420"
        />
        <div className="schead">
          <h3>Сценарии</h3>
          {changed.length > 0 && <span className="scbadge">{changed.length} из {keys.length}</span>}
          {/* В шапке подсказок по наведению нет: они раскрывались вниз
              и закрывали вкладки. Смысл кнопок несёт их состояние. */}
          <button className="scx" data-tour aria-label="Пройти обучение по панели" title="Обучение">?</button>
          <button className="scx" data-scside aria-label="Перенести панель на другую сторону">⇄</button>
          {WIDTHS.map((w, i) => (
            <button
              key={w}
              className={`scw ${width === w ? 'on' : ''}`}
              data-scw={w}
              aria-label={`Ширина ${w}`}
            >{'SML'[i]}</button>
          ))}
          <button className="scx" data-panel aria-label="Закрыть">×</button>
        </div>

        <div className="sctabs">
          {TABS.map(([id, t]) => (
            <button key={id} className={tab === id ? 'on' : ''} data-sctab={id}>
              {t}
              {id === 'ax' && changedAx.length > 0 && <i className="scnum">{changedAx.length}</i>}
              {id === 'sty' && changedSty.length > 0 && <i className="scnum">{changedSty.length}</i>}
            </button>
          ))}
        </div>

        <div className="scbar">
          {tab !== 'chat' && (
            <input className="scsearch" id="scq" placeholder="Найти ось, значение или экран" defaultValue={U.scq || ''} />
          )}
          {tab === 'ax' && (
            <>
              <button className={`scchip ${onlyDirty ? 'on' : ''}`} aria-pressed={onlyDirty} data-onlydirty title="Только изменённые оси">
                Изменённые{changedAx.length > 0 && ` ${changedAx.length}`}
              </button>
              <button className={`scchip ${onlyPin ? 'on' : ''}`} aria-pressed={onlyPin} data-onlypin title="Только закреплённые оси">
                ★{pins.length > 0 && ` ${pins.length}`}
              </button>
              <button className={`scchip ${onlyFigma ? 'on' : ''}`} aria-pressed={onlyFigma} data-onlyfigma title="Только оси, у которых есть кадр в макетах">
                Из макетов {keys.length - own.length}
              </button>
              <button className="scchip" data-sccol="all" title="Свернуть все группы">Свернуть</button>
              <button className="scchip" data-sccol="none" title="Развернуть все группы">Развернуть</button>
              <button className="scchip" data-rand title="Случайные значения всех осей">Случайный</button>
            </>
          )}
        </div>

        <div className="scbody">
        {tab === 'ax' && (
          <>
            {!!pins.length && !onlyDirty && (
              <section className="scsec">
                <div className="scshead"><div className="scsect plain">Закреплённые</div></div>
                {pins.filter(visible).map(axisRow)}
              </section>
            )}
            {/* Группа, забытая в AXCAT, всё равно рисуется — иначе её оси
                молча пропадают из панели */}
            {[...AXCAT, ['Прочее', [...new Set(keys.map((k) => AXES[k].g))]
              .filter((g) => !AXCAT.some(([, gs]) => gs.includes(g)))] as [string, string[]]]
              .map(([cat, gs]) => {
                const body = gs.map(groupSection).filter(Boolean)
                if (!body.length) return null
                return (
                  <div className="sccat" key={cat}>
                    <div className="sccath">{cat}</div>
                    {body}
                  </div>
                )
              })}
            {!keys.filter(visible).length && (
              <p className="scnote">Ничего не нашлось. Сбросьте поиск или фильтры.</p>
            )}
          </>
        )}

        {tab === 'chat' && (
          <div className="scchat">
            <p className="scdesc">
              Чат включает состояния словами: «авария на парке», «тёмная тема», «открой выплаты».
              Разбор запроса пока свой, без модели — прототип раздаётся статикой, ключу от API
              там негде лежать.
            </p>
            <div className="scmsgs">
              {(U.chat || []).map((m, i) => (
                <div className={`scmsg ${m.role}`} key={i}>{m.text}</div>
              ))}
              {!(U.chat || []).length && (
                <div className="scmsg bot">Скажите, что показать. Например: «крупный клиент»,
                  «пусто в таблицах», «наблюдатель», «шрифт Onest».</div>
              )}
            </div>
            <div className="scbar">
              {((U.chat || []).length ? U.chatchips || [] : CHAT_HINTS).map((c) => (
                <button className="scchip" data-chatsay={c} key={c}>{c}</button>
              ))}
              {!!(U.chat || []).length && (
                <button className="scchip" data-chatclear title="Очистить переписку">Очистить</button>
              )}
            </div>
            <div className="scsave">
              <input id="scchat" placeholder="Что показать?" />
              <button data-chatsend>Отправить</button>
            </div>
          </div>
        )}

        {tab === 'sty' && (
          <>
            <div className="scg">
              <label><span className="scl">Оформление</span></label>
              <p className="scdesc">
                Не состояния продукта, а эксперимент с внешним видом: шрифт, акцент, скругления,
                отступы и набор иконок. Применяется сразу — перезагружать ничего не нужно,
                и всё уезжает в ссылку вместе со сценарием.
              </p>
            </div>

            {!!fonts.length && (
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Шрифт<span className="scqty">{fonts.length}</span></div></div>
              <p className="scdesc">Gilroy — как в продукте, остальные из Google Fonts. Каждая кнопка набрана своей гарнитурой.</p>
              <div className="scfont">
                {fonts.map(([v, t]: [string, string]) => (
                  <button
                    key={v} data-axis="font" data-val={v}
                    className={S.font === v ? 'on' : ''}
                    style={{ fontFamily: `'${FONTS[v].name}', sans-serif` }}
                  >{t}<i>Агрегатор 128</i></button>
                ))}
              </div>
            </section>
            )}

            {!!accents.length && (
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Акцентный цвет</div></div>
              <p className="scdesc">Кнопки, ссылки, активные пункты меню и обводка фокуса.</p>
              <div className="scsw">
                {accents.map(([v, t]: [string, string]) => (
                  <button
                    key={v} data-axis="accent" data-val={v} title={t}
                    className={`${S.accent === v ? 'on' : ''} ${v === 'ds' ? 'dsw' : ''}`}
                    style={v === 'ds' ? undefined : { background: '#' + v }}
                  >{v === 'ds' ? 'ДС' : ''}</button>
                ))}
              </div>
              <div className="scpick">
                <input type="color" id="scacc" value={'#' + (/^[0-9a-f]{6}$/i.test(S.accent) ? S.accent : '7086fc')} readOnly />
                <input id="schex" placeholder="7086fc" maxLength={7}
                  defaultValue={/^[0-9a-f]{6}$/i.test(S.accent) ? S.accent : ''} />
                <button className="scchip" data-eyedrop>Пипетка с экрана</button>
              </div>
            </section>
            )}

            {!!styRows.length && (
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Скругления и отступы</div></div>
              {styRows.map(axisRow)}
            </section>
            )}

            {!!packs.length && (
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Иконки<span className="scqty">{packs.length}</span></div></div>
              <p className="scdesc">Набор дизайн-системы и четыре открытых: Material Sharp, Lucide, Phosphor Thin, Material Design.</p>
              <div className="scpack">
                {packs.map(([id, name, note]: [string, string, string]) => (
                  <button key={id} data-axis="icons" data-val={id} className={S.icons === id ? 'on' : ''}>
                    <span className="scico" dangerouslySetInnerHTML={{ __html: iconSample(id) }} />
                    <b>{name}</b><i>{note}</i>
                  </button>
                ))}
              </div>
            </section>

            )}

            {styEmpty && <p className="scnote">Ничего не нашлось. Сбросьте поиск.</p>}

            <div className="scbar">
              <button className="scchip" data-styreset>Сбросить оформление</button>
            </div>
          </>
        )}

        {tab === 'sets' && (
          <>
            <div className="scg">
              <label><span className="scl">Готовые связки</span></label>
              <p className="scdesc">Обычный клик заменяет весь сценарий, «+» — накладывает набор поверх текущего.</p>
            </div>
            {[...new Set(PRESETS.map((p) => p[3]))].map((cat) => {
              const list = PRESETS.filter((p) => p[3] === cat && (hit(p[0]) || hit(p[1])))
              if (!list.length) return null
              return (
                <section className="scsec" key={cat}>
                  <div className="scshead"><div className="scsect plain">{cat}</div></div>
                  <div className="scp">
                    {list.map(([name, note, axes]) => (
                      <div className="scrow" key={name}>
                        <button data-preset={name}>
                          <b>{name}</b><i>{note} · {Object.keys(axes).length} осей</i>
                        </button>
                        <button className="scadd" data-preset={name} data-over title="Наложить поверх текущего">+</button>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}

            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Мои сценарии</div></div>
              <div className="scsave">
                <input id="scname" placeholder="Название текущего набора" />
                <button data-save disabled={!changed.length}>Сохранить</button>
              </div>
              {saved.length > 0 ? (
                <div className="scp">
                  {saved.map((s) => (
                    <div className="scrow" key={s.name}>
                      <button data-apply={s.name}>
                        <b>{s.name}</b>
                        <i>{Object.keys(s.axes).length} осей{s.at ? ` · ${new Date(s.at).toLocaleDateString('ru')}` : ''}</i>
                      </button>
                      <button className="scadd" data-apply={s.name} data-over title="Наложить поверх текущего">+</button>
                      <button className="scdel" data-delsave={s.name} aria-label="Удалить">×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="scnote">Настройте оси и сохраните набор — он останется в этом браузере.</p>
              )}
            </section>

            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Обмен</div></div>
              <div className="scsave">
                <input id="scimp" placeholder="Вставьте ссылку и нажмите «Открыть»" />
                <button data-scimport>Открыть</button>
              </div>
              <div className="scbar">
                <button className="scchip" data-copylink>Скопировать ссылку</button>
                <button className="scchip" data-copyjson>Скопировать JSON</button>
              </div>
            </section>

            {!!changed.length && (
              <section className="scsec">
                <div className="scshead"><div className="scsect plain">Что отличается от умолчаний</div></div>
                <div className="scdiff">
                  {changed.map((k) => (
                    <div key={k}>
                      <span className="dk">{AXES[k].label}</span>
                      <span className="dv">
                        {(AXES[k].opts.find(([v]) => v === DEF[k]) || ['', DEF[k]])[1]}
                        {' → '}<b>{valOf(k)}</b>
                      </span>
                      <button className="scundo" data-axreset={k} title="Вернуть значение по умолчанию">↺</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'go' && (
          <>
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Экраны<span className="scqty">{screens.length}</span></div></div>
              <div className="sco">
                {screens.map(([id, t]) => (
                  <button data-go={id} className={route === id ? 'on' : ''} key={id}>{t}</button>
                ))}
              </div>
            </section>
            <section className="scsec">
              <div className="scshead"><div className="scsect plain">Модальные окна<span className="scqty">{modals.length}</span></div></div>
              <p className="scdesc">Открываются поверх текущего экрана — удобно смотреть окно в нужном сценарии.</p>
              <div className="sco">
                {modals.map(([k, t]) => (
                  <button data-modal={k} key={k}>{t}</button>
                ))}
              </div>
            </section>
          </>
        )}

        </div>

        <div className="scf">
          <button data-scback disabled={!hist.length} title="Шаг назад по истории">
            ↩ Отменить{hist.length > 0 && ` (${hist.length})`}
          </button>
          <button data-reset disabled={!changedAx.length}
            title="Вернуть состояния продукта к умолчанию — оформление останется, его сброс на вкладке «Стиль»">
            Сбросить{changedAx.length > 0 && ` (${changedAx.length})`}
          </button>
          <button data-copylink>Ссылка</button>
          <span className="schint"><b>S</b> — панель, <b>/</b> — поиск, <b>Esc</b> — закрыть</span>
        </div>
      </aside>
    </>
  )
}
