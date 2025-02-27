// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as IssuesManager from '../../models/issues_manager/issues_manager.js';

import cspViolationsViewStyles from './cspViolationsView.css.js';

import type * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';

import {ComboBoxOfCheckBoxes} from './ComboBoxOfCheckBoxes.js';
import {CSPViolationsListView} from './CSPViolationsListView.js';

const UIStrings = {
  /**
  *@description Text to filter result items
  */
  filter: 'Filter',
};
const str_ = i18n.i18n.registerUIStrings('panels/issues/CSPViolationsView.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let cspViolationsViewInstance: CSPViolationsView;
export class CSPViolationsView extends UI.Widget.VBox {
  private listView = new CSPViolationsListView();
  private issuesManager = IssuesManager.IssuesManager.IssuesManager.instance();

  /**
   * @private
   */
  constructor() {
    super(true);

    this.contentElement.classList.add('csp-violations-pane');

    const topToolbar = new UI.Toolbar.Toolbar('csp-violations-toolbar', this.contentElement);
    const textFilterUI = new UI.Toolbar.ToolbarInput(i18nString(UIStrings.filter), '', 1, .2, '');
    textFilterUI.addEventListener(UI.Toolbar.ToolbarInput.Event.TextChanged, () => {
      this.listView.updateTextFilter(textFilterUI.value());
    });
    topToolbar.appendToolbarItem(textFilterUI);

    const levelMenuButton = new ComboBoxOfCheckBoxes('Categories');
    levelMenuButton.setText('Categories');
    levelMenuButton.addOption(
        'Trusted Type Policy', IssuesManager.ContentSecurityPolicyIssue.trustedTypesPolicyViolationCode, true);
    levelMenuButton.addOption(
        'Trusted Type Sink', IssuesManager.ContentSecurityPolicyIssue.trustedTypesSinkViolationCode, true);
    levelMenuButton.addOption('CSP Inline', IssuesManager.ContentSecurityPolicyIssue.inlineViolationCode, true);
    levelMenuButton.addOption('CSP Eval', IssuesManager.ContentSecurityPolicyIssue.evalViolationCode, true);
    levelMenuButton.addOption('CSP URL', IssuesManager.ContentSecurityPolicyIssue.urlViolationCode, true);
    levelMenuButton.addHeader('Reset', () => {
      levelMenuButton.getOptions().forEach((x, i) => levelMenuButton.setOptionEnabled(i, x.default));
    });
    levelMenuButton.setOnOptionClicked(() => {
      const categories = new Set(levelMenuButton.getOptions().filter(x => x.enabled).map(x => x.value));
      this.listView.updateCategoryFilter(categories);
    });
    topToolbar.appendToolbarItem(levelMenuButton);
    this.listView.show(this.contentElement);

    this.issuesManager.addEventListener(IssuesManager.IssuesManager.Events.IssueAdded, this.onIssueAdded, this);
    this.issuesManager.addEventListener(
        IssuesManager.IssuesManager.Events.FullUpdateRequired, this.onFullUpdateRequired, this);

    this.addAllIssues();
  }

  static instance(opts = {forceNew: null}): CSPViolationsView {
    const {forceNew} = opts;
    if (!cspViolationsViewInstance || forceNew) {
      cspViolationsViewInstance = new CSPViolationsView();
    }

    return cspViolationsViewInstance;
  }

  private onIssueAdded(event: Common.EventTarget.EventTargetEvent<IssuesManager.IssuesManager.IssueAddedEvent>): void {
    const {issue} = event.data;
    if (issue instanceof IssuesManager.ContentSecurityPolicyIssue.ContentSecurityPolicyIssue) {
      this.listView.addIssue(issue);
    }
  }

  private onFullUpdateRequired(): void {
    this.listView.clearIssues();
    this.addAllIssues();
  }

  private addAllIssues(): void {
    for (const issue of this.issuesManager.issues()) {
      if (issue instanceof IssuesManager.ContentSecurityPolicyIssue.ContentSecurityPolicyIssue) {
        this.listView.addIssue(issue);
      }
    }
  }
  wasShown(): void {
    super.wasShown();
    this.registerCSSFiles([cspViolationsViewStyles]);
  }
}
