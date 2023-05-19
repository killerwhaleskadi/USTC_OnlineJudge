import { getScoreColor } from '@hydrooj/utils/lib/status';
import $ from 'jquery';
import yaml from 'js-yaml';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Notification from 'vj/components/notification';
import { downloadProblemSet } from 'vj/components/zipDownloader';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, loadReactRedux, pjax, request, tpl,
} from 'vj/utils';

class ProblemPageExtender {
  constructor() {
    this.isExtended = false;
    this.inProgress = false;
    this.$content = $('.problem-content-container');
    this.$contentBound = this.$content.closest('.section');
    this.$scratchpadContainer = $('.scratchpad-container');
  }

  async extend() {
    if (this.inProgress) return;
    if (this.isExtended) return;
    this.inProgress = true;

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    this.$content.transition({ opacity: 0 }, { duration: 100 });
    await delay(100);

    $('body').addClass('header--collapsed mode--scratchpad');
    await this.$scratchpadContainer
      .css({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      })
      .show()
      .transition({
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    $('.main > .row').hide();
    $('.footer').hide();
    $(window).scrollTop(0);
    window.document.body.style.overflow = 'hidden';

    this.inProgress = false;
    this.isExtended = true;
  }

  async collapse() {
    if (this.inProgress) return;
    if (!this.isExtended) return;
    this.inProgress = true;

    $(window).scrollTop(0);
    $('.main > .row').show();
    $('.footer').show();

    const bound = this.$contentBound
      .get(0)
      .getBoundingClientRect();

    $('body').removeClass('header--collapsed mode--scratchpad');

    await this.$scratchpadContainer
      .transition({
        left: bound.left,
        top: bound.top,
        width: bound.width,
        height: bound.height,
      }, {
        duration: 500,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$scratchpadContainer.hide();
    this.$content.transition({ opacity: 1 }, { duration: 100 });
    window.document.body.style.overflow = 'scroll';

    this.inProgress = false;
    this.isExtended = false;
  }

  toggle() {
    if (this.isExtended) this.collapse();
    else this.extend();
  }
}

const page = new NamedPage(['problem_detail', 'contest_detail_problem', 'homework_detail_problem'], async (pagename) => {
  let reactLoaded = false;
  let renderReact = null;
  let unmountReact = null;
  const extender = new ProblemPageExtender();

  async function handleClickDownloadProblem() {
    await downloadProblemSet([UiContext.problemNumId], UiContext.pdoc.title);
  }

  async function scratchpadFadeIn() {
    await $('#scratchpad')
      .transition(
        { opacity: 1 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function scratchpadFadeOut() {
    await $('#scratchpad')
      .transition(
        { opacity: 0 },
        { duration: 200, easing: 'easeOutCubic' },
      )
      .promise();
  }

  async function loadReact() {
    if (reactLoaded) return;
    $('.loader-container').show();

    const { default: WebSocket } = await import('../components/socket');
    const { default: ScratchpadApp } = await import('../components/scratchpad');
    const { default: ScratchpadReducer } = await import('../components/scratchpad/reducers');
    const { Provider, store } = await loadReactRedux(ScratchpadReducer);

    window.store = store;
    const sock = new WebSocket(UiContext.ws_prefix + UiContext.pretestConnUrl);
    sock.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      store.dispatch({
        type: 'SCRATCHPAD_RECORDS_PUSH',
        payload: msg,
      });
    };

    renderReact = () => {
      const root = createRoot($('#scratchpad').get(0));
      root.render(
        <Provider store={store}>
          <ScratchpadApp />
        </Provider>,
      );
      unmountReact = () => root.unmount();
    };
    reactLoaded = true;
    $('.loader-container').hide();
  }

  let progress = false;

  async function enterScratchpadMode() {
    if (progress) return;
    progress = true;
    await extender.extend();
    await loadReact();
    renderReact();
    await scratchpadFadeIn();
    progress = false;
  }

  async function leaveScratchpadMode() {
    if (progress) return;
    progress = true;
    await scratchpadFadeOut();
    $('.problem-content-container').append($('.problem-content'));
    await extender.collapse();
    unmountReact();
    progress = false;
  }

  async function loadObjective() {
    $('.outer-loader-container').show();
    const ans = {};
    const pids = [];
    let cnt = 0;
    const reg = /{{ (input|select|multiselect|textarea)\(\d+(-\d+)?\) }}/g;
    $('.problem-content .typo').children().each((i, e) => {
      if (e.tagName === 'PRE' && !e.children[0].className.includes('#input')) return;
      const questions = [];
      let q;
      while (q = reg.exec(e.innerText)) questions.push(q); // eslint-disable-line no-cond-assign
      for (const [info, type] of questions) {
        cnt++;
        const id = info.replace(/{{ (input|select|multiselect|textarea)\((\d+(-\d+)?)\) }}/, '$2');
        pids.push(id);
        if (type === 'input') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} medium-3" id="p${id}" style="display: inline-block;">
              <input type="text" name="${id}" class="textbox objective-input">
            </div>
          `));
        } else if (type === 'textarea') {
          $(e).html($(e).html().replace(info, tpl`
            <div class="objective_${id} medium-6" id="p${id}">
              <textarea name="${id}" class="textbox objective-input"></textarea>
            </div>
          `));
        } else {
          if ($(e).next()[0]?.tagName !== 'UL') {
            cnt--;
            return;
          }
          $(e).html($(e).html().replace(info, ''));
          $(e).next('ul').children().each((j, ele) => {
            $(ele).after(tpl`
              <label class="objective_${id} radiobox" id="p${id}">
                <input type="${type === 'select' ? 'radio' : 'checkbox'}" name="${id}" class="objective-input" value="${String.fromCharCode(65 + j)}">
                ${String.fromCharCode(65 + j)}. ${{ templateRaw: true, html: ele.innerHTML }}
              </label>
            `);
            $(ele).remove();
          });
        }
      }
    });

    let setUpdate;
    function ProblemNavigation() {
      [, setUpdate] = React.useState(0);
      return <div className="contest-problems" style={{ margin: '1em' }}>
        {pids.map((i) => <a href={`#p${i}`} className={ans[i] ? 'pass ' : ''}>
          <span class="id">{i}</span>
          {ans[i] && <span class="icon icon-check"></span>}
        </a>)}
      </div>;
    }

    function saveAns() {
      localStorage.setItem(`objective_${UiContext.domain._id}#${UiContext.pdoc.docId}`, JSON.stringify(ans));
      setUpdate?.((i) => i + 1);
    }
    function loadAns() {
      const saved = localStorage.getItem(`objective_${UiContext.domain._id}#${UiContext.pdoc.docId}`);
      if (saved) {
        Object.assign(ans, JSON.parse(saved));
        for (const [id, val] of Object.entries(ans)) {
          if (Array.isArray(val)) {
            for (const v of val) {
              $(`.objective_${id} input[value=${v}]`).prop('checked', true);
            }
          }
          $(`.objective_${id} input[type=text], .objective_${id} textarea`).val(val);
          $(`.objective_${id}.radiobox [value="${val}"]`).prop('checked', true);
        }
      }
    }

    if (cnt) {
      loadAns();
      $('.problem-content .typo').append(document.getElementsByClassName('nav__item--round').length
        ? `<input type="submit" disabled class="button rounded primary disabled" value="${i18n('Login to Submit')}" />`
        : `<input type="submit" class="button rounded primary" value="${i18n('Submit')}" />`);
      $('.objective-input[type!=checkbox]').on('input', (e) => {
        ans[e.target.name] = e.target.value;
        saveAns();
      });
      $('input.objective-input[type=checkbox]').on('input', (e) => {
        if (e.target.checked) {
          if (ans[e.target.name] === undefined) ans[e.target.name] = [];
          ans[e.target.name].push(e.target.value);
        } else {
          ans[e.target.name] = ans[e.target.name].filter((v) => v !== e.target.value);
        }
        saveAns();
      });
      $('input[type="submit"]').on('click', (e) => {
        e.preventDefault();
        request
          .post(UiContext.postSubmitUrl, {
            lang: '_',
            code: yaml.dump(ans),
          })
          .then((res) => {
            window.location.href = res.url;
          })
          .catch((err) => {
            Notification.error(err.message);
          });
      });
    }
    const ele = document.createElement('div');
    $(ele).insertBefore($('.scratchpad--hide').get(0));
    createRoot(ele).render(<ProblemNavigation />);
    $('.non-scratchpad--hide').hide();
    $('.scratchpad--hide').hide();
    $('.outer-loader-container').hide();
  }

  async function initChart() {
    if (!Object.keys(UiContext.pdoc.stats || {}).length) {
      $('#submission-status-placeholder').parent().hide();
      return;
    }
    const echarts = await import('echarts');
    const $status = document.getElementById('submission-status-placeholder');
    const statusChart = echarts.init($status);
    statusChart.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          name: 'Submissions',
          type: 'pie',
          radius: '70%',
          label: { show: false },
          labelLine: { show: false },
          data: [
            { value: UiContext.pdoc.stats.TLE, name: 'TLE' },
            { value: UiContext.pdoc.stats.AC, name: 'AC' },
            { value: UiContext.pdoc.stats.MLE, name: 'MLE' },
            { value: UiContext.pdoc.stats.WA, name: 'WA' },
            { value: UiContext.pdoc.stats.RE, name: 'RE' },
            { value: UiContext.pdoc.stats.CE, name: 'CE' },
          ],
        },
      ],
    });
    const $score = document.getElementById('submission-score-placeholder');
    const x = Array.from({ length: 101 }, (v, i) => i).filter((i) => UiContext.pdoc.stats[`s${i}`]);
    const scoreChart = echarts.init($score);
    scoreChart.setOption({
      tooltip: { trigger: 'item' },
      xAxis: { data: x },
      yAxis: {},
      series: [{
        data: x.map((i) => ({
          value: UiContext.pdoc.stats[`s${i}`],
          itemStyle: { color: getScoreColor(i) },
        })),
        type: 'bar',
      }],
    });

    window.onresize = function () {
      statusChart.resize();
      scoreChart.resize();
    };
    if (UiContext.pdoc.config?.type === 'objective') $($status).hide();
  }

  $(document).on('click', '[name="problem-sidebar__open-scratchpad"]', (ev) => {
    enterScratchpadMode();
    ev.preventDefault();
  });
  $(document).on('click', '[name="problem-sidebar__quit-scratchpad"]', (ev) => {
    leaveScratchpadMode();
    ev.preventDefault();
  });

  $(document).on('click', '[data-lang]', (ev) => {
    ev.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('lang', ev.currentTarget.dataset.lang);
    $('[data-lang]').removeClass('tab--active');
    pjax.request({ url: url.toString() });
    $(ev.currentTarget).addClass('tab--active');
  });
  $(document).on('click', '[name="show_tags"]', (ev) => {
    $(ev.currentTarget).hide();
    $('span.tags').css('display', 'inline-block');
  });
  $('[name="problem-sidebar__download"]').on('click', handleClickDownloadProblem);
  if (UiContext.pdoc.config?.type === 'objective') loadObjective();
  if (pagename !== 'contest_detail_problem') initChart();
});

export default page;
