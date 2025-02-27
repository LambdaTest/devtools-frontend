// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import * as Issues from '../../../../../front_end/panels/issues/issues.js';
import type * as Common from '../../../../../front_end/core/common/common.js';
import * as IssuesManager from '../../../../../front_end/models/issues_manager/issues_manager.js';
import type * as SDK from '../../../../../front_end/core/sdk/sdk.js';
import {StubIssue} from '../../models/issues_manager/StubIssue.js';
import {MockIssuesModel} from '../../models/issues_manager/MockIssuesModel.js';
import {MockIssuesManager} from '../../models/issues_manager/MockIssuesManager.js';
import * as Protocol from '../../../../../front_end/generated/protocol.js';
import {createFakeSetting, enableFeatureForTest} from '../../helpers/EnvironmentHelpers.js';

describe('AggregatedIssue', async () => {
  it('deduplicates network requests across issues', () => {
    const issue1 = StubIssue.createFromRequestIds(['id1', 'id2']);
    const issue2 = StubIssue.createFromRequestIds(['id1']);

    const aggregatedIssue = new Issues.IssueAggregator.AggregatedIssue('code');
    aggregatedIssue.addInstance(issue1);
    aggregatedIssue.addInstance(issue2);

    const actualRequestIds = [...aggregatedIssue.requests()].map(r => r.requestId).sort();
    assert.deepStrictEqual(actualRequestIds, ['id1', 'id2']);
  });

  it('deduplicates affected cookies across issues', () => {
    const issue1 = StubIssue.createFromCookieNames(['cookie1']);
    const issue2 = StubIssue.createFromCookieNames(['cookie2']);
    const issue3 = StubIssue.createFromCookieNames(['cookie1', 'cookie2']);

    const aggregatedIssue = new Issues.IssueAggregator.AggregatedIssue('code');
    aggregatedIssue.addInstance(issue1);
    aggregatedIssue.addInstance(issue2);
    aggregatedIssue.addInstance(issue3);

    const actualCookieNames = [...aggregatedIssue.cookies()].map(c => c.name).sort();
    assert.deepStrictEqual(actualCookieNames, ['cookie1', 'cookie2']);
  });
});

describe('IssueAggregator', async () => {
  it('deduplicates issues with the same code', () => {
    const issue1 = StubIssue.createFromRequestIds(['id1']);
    const issue2 = StubIssue.createFromRequestIds(['id2']);

    const mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
    const mockManager = new MockIssuesManager([]) as unknown as IssuesManager.IssuesManager.IssuesManager;
    const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue1});
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue2});

    const issues = Array.from(aggregator.aggregatedIssues());
    assert.strictEqual(issues.length, 1);
    const requestIds = [...issues[0].requests()].map(r => r.requestId).sort();
    assert.deepStrictEqual(requestIds, ['id1', 'id2']);
  });

  it('deduplicates issues with the same code added before its creation', () => {
    const issue1 = StubIssue.createFromRequestIds(['id1']);
    const issue2 = StubIssue.createFromRequestIds(['id2']);
    const issue1b = StubIssue.createFromRequestIds(['id1']);  // Duplicate id.
    const issue3 = StubIssue.createFromRequestIds(['id3']);

    const mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
    const mockManager =
        new MockIssuesManager([issue1b, issue3]) as unknown as IssuesManager.IssuesManager.IssuesManager;
    const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue1});
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue2});

    const issues = Array.from(aggregator.aggregatedIssues());
    assert.strictEqual(issues.length, 1);
    const requestIds = [...issues[0].requests()].map(r => r.requestId).sort();
    assert.deepStrictEqual(requestIds, ['id1', 'id2', 'id3']);
  });

  it('keeps issues with different codes separate', () => {
    const issue1 = new StubIssue('codeA', ['id1'], []);
    const issue2 = new StubIssue('codeB', ['id1'], []);
    const issue1b = new StubIssue('codeC', ['id1'], []);
    const issue3 = new StubIssue('codeA', ['id1'], []);

    const mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
    const mockManager =
        new MockIssuesManager([issue1b, issue3]) as unknown as IssuesManager.IssuesManager.IssuesManager;
    const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue1});
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue2});

    const issues = Array.from(aggregator.aggregatedIssues());
    assert.strictEqual(issues.length, 3);
    const issueCodes = issues.map(r => r.code()).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(issueCodes, ['codeA', 'codeB', 'codeC']);
  });

  describe('aggregates issue kind', () => {
    it('for a single issue', () => {
      const issues = StubIssue.createFromIssueKinds([IssuesManager.Issue.IssueKind.Improvement]);

      const mockManager = new MockIssuesManager(issues) as unknown as IssuesManager.IssuesManager.IssuesManager;
      const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);

      const aggregatedIssues = Array.from(aggregator.aggregatedIssues());
      assert.strictEqual(aggregatedIssues.length, 1);
      const aggregatedIssue = aggregatedIssues[0];
      assert.strictEqual(aggregatedIssue.getKind(), IssuesManager.Issue.IssueKind.Improvement);
    });

    it('for issues of two different kinds', () => {
      const issues = StubIssue.createFromIssueKinds([
        IssuesManager.Issue.IssueKind.Improvement,
        IssuesManager.Issue.IssueKind.BreakingChange,
        IssuesManager.Issue.IssueKind.Improvement,
      ]);

      const mockManager = new MockIssuesManager(issues) as unknown as IssuesManager.IssuesManager.IssuesManager;
      const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);

      const aggregatedIssues = Array.from(aggregator.aggregatedIssues());
      assert.strictEqual(aggregatedIssues.length, 1);
      const aggregatedIssue = aggregatedIssues[0];
      assert.strictEqual(aggregatedIssue.getKind(), IssuesManager.Issue.IssueKind.BreakingChange);
    });

    it('for issues of three different kinds', () => {
      const issues = StubIssue.createFromIssueKinds([
        IssuesManager.Issue.IssueKind.BreakingChange,
        IssuesManager.Issue.IssueKind.PageError,
        IssuesManager.Issue.IssueKind.Improvement,
      ]);

      const mockManager = new MockIssuesManager(issues) as unknown as IssuesManager.IssuesManager.IssuesManager;
      const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);

      const aggregatedIssues = Array.from(aggregator.aggregatedIssues());
      assert.strictEqual(aggregatedIssues.length, 1);
      const aggregatedIssue = aggregatedIssues[0];
      assert.strictEqual(aggregatedIssue.getKind(), IssuesManager.Issue.IssueKind.PageError);
    });
  });
});

describe('IssueAggregator', async () => {
  it('aggregates heavy ad issues correctly', () => {
    const mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
    const details1 = {
      resolution: Protocol.Audits.HeavyAdResolutionStatus.HeavyAdBlocked,
      reason: Protocol.Audits.HeavyAdReason.CpuPeakLimit,
      frame: {frameId: 'main' as Protocol.Page.FrameId},
    };
    const issue1 = new IssuesManager.HeavyAdIssue.HeavyAdIssue(details1, mockModel);
    const details2 = {
      resolution: Protocol.Audits.HeavyAdResolutionStatus.HeavyAdWarning,
      reason: Protocol.Audits.HeavyAdReason.NetworkTotalLimit,
      frame: {frameId: 'main' as Protocol.Page.FrameId},
    };
    const issue2 = new IssuesManager.HeavyAdIssue.HeavyAdIssue(details2, mockModel);

    const mockManager = new MockIssuesManager([]) as unknown as IssuesManager.IssuesManager.IssuesManager;
    const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue1});
    mockManager.dispatchEventToListeners(
        IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue2});

    const issues = Array.from(aggregator.aggregatedIssues());
    assert.strictEqual(issues.length, 1);
    const resolutions = [...issues[0].getHeavyAdIssues()].map(r => r.details().resolution).sort();
    assert.deepStrictEqual(resolutions, [
      Protocol.Audits.HeavyAdResolutionStatus.HeavyAdBlocked,
      Protocol.Audits.HeavyAdResolutionStatus.HeavyAdWarning,
    ]);
  });

  const scriptId1 = '1' as Protocol.Runtime.ScriptId;

  describe('IssueAggregator', async () => {
    it('aggregates affected locations correctly', () => {
      const mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
      const issue1 = StubIssue.createFromAffectedLocations([{url: 'foo', lineNumber: 1, columnNumber: 1}]);
      const issue2 = StubIssue.createFromAffectedLocations([
        {url: 'foo', lineNumber: 1, columnNumber: 1},
        {url: 'foo', lineNumber: 1, columnNumber: 12},
      ]);
      const issue3 = StubIssue.createFromAffectedLocations([
        {url: 'bar', lineNumber: 1, columnNumber: 1},
        {url: 'baz', lineNumber: 1, columnNumber: 1},
      ]);
      const issue4 = StubIssue.createFromAffectedLocations([
        {url: 'bar', lineNumber: 1, columnNumber: 1, scriptId: scriptId1},
        {url: 'foo', lineNumber: 2, columnNumber: 1},
      ]);

      const mockManager = new MockIssuesManager([]) as unknown as IssuesManager.IssuesManager.IssuesManager;
      const aggregator = new Issues.IssueAggregator.IssueAggregator(mockManager);
      for (const issue of [issue1, issue2, issue3, issue4]) {
        mockManager.dispatchEventToListeners(
            IssuesManager.IssuesManager.Events.IssueAdded, {issuesModel: mockModel, issue: issue});
      }

      const issues = Array.from(aggregator.aggregatedIssues());
      assert.strictEqual(issues.length, 1);
      const locations = [...issues[0].sources()].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      assert.deepStrictEqual(locations, [
        {url: 'bar', lineNumber: 1, columnNumber: 1, scriptId: scriptId1},
        {url: 'bar', lineNumber: 1, columnNumber: 1},
        {url: 'baz', lineNumber: 1, columnNumber: 1},
        {url: 'foo', lineNumber: 1, columnNumber: 1},
        {url: 'foo', lineNumber: 1, columnNumber: 12},
        {url: 'foo', lineNumber: 2, columnNumber: 1},
      ]);
    });
  });
});

describe('IssueAggregator', () => {
  enableFeatureForTest('hideIssuesFeature');
  let hideIssueByCodeSetting: Common.Settings.Setting<IssuesManager.IssuesManager.HideIssueMenuSetting>;
  let showThirdPartyIssuesSetting: Common.Settings.Setting<boolean>;
  let issuesManager: IssuesManager.IssuesManager.IssuesManager;
  let mockModel: SDK.IssuesModel.IssuesModel;
  let aggregator: Issues.IssueAggregator.IssueAggregator;

  beforeEach(() => {
    hideIssueByCodeSetting =
        createFakeSetting('hide by code', ({} as IssuesManager.IssuesManager.HideIssueMenuSetting));
    showThirdPartyIssuesSetting = createFakeSetting('third party flag', false);
    issuesManager = new IssuesManager.IssuesManager.IssuesManager(showThirdPartyIssuesSetting, hideIssueByCodeSetting);
    mockModel = new MockIssuesModel([]) as unknown as SDK.IssuesModel.IssuesModel;
    issuesManager.modelAdded(mockModel);
    aggregator = new Issues.IssueAggregator.IssueAggregator(issuesManager);
  });

  it('aggregates hidden issues correctly', () => {
    const issues = [
      new StubIssue('HiddenStubIssue1', [], []),
      new StubIssue('HiddenStubIssue2', [], []),
      new StubIssue('UnhiddenStubIssue1', [], []),
      new StubIssue('UnhiddenStubIssue2', [], []),
    ];

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'HiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });

    for (const issue of issues) {
      issuesManager.addIssue(mockModel, issue);
    }
    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 2);
    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 2);
  });

  it('aggregates hidden issues correctly on updating settings', () => {
    const issues = [
      new StubIssue('HiddenStubIssue1', [], []),
      new StubIssue('HiddenStubIssue2', [], []),
      new StubIssue('UnhiddenStubIssue1', [], []),
      new StubIssue('UnhiddenStubIssue2', [], []),
    ];

    for (const issue of issues) {
      issuesManager.addIssue(mockModel, issue);
    }

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });
    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 3);
    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 1);

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'HiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });
    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 2);
    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 2);
  });

  it('aggregates hidden issues correctly when issues get unhidden', () => {
    const issues = [
      new StubIssue('HiddenStubIssue1', [], []),
      new StubIssue('HiddenStubIssue2', [], []),
      new StubIssue('UnhiddenStubIssue1', [], []),
      new StubIssue('UnhiddenStubIssue2', [], []),
    ];

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'HiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'UnhiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'UnhiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });

    for (const issue of issues) {
      issuesManager.addIssue(mockModel, issue);
    }

    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 4);
    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 0);

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'HiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'UnhiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Unhidden,
      'UnhiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });

    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 1);
    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 3);
  });

  it('aggregates hidden issues correctly when all issues get unhidden', () => {
    const issues = [
      new StubIssue('HiddenStubIssue1', [], []),
      new StubIssue('HiddenStubIssue2', [], []),
      new StubIssue('UnhiddenStubIssue1', [], []),
      new StubIssue('UnhiddenStubIssue2', [], []),
    ];

    hideIssueByCodeSetting.set({
      'HiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'HiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'UnhiddenStubIssue1': IssuesManager.IssuesManager.IssueStatus.Hidden,
      'UnhiddenStubIssue2': IssuesManager.IssuesManager.IssueStatus.Hidden,
    });

    for (const issue of issues) {
      issuesManager.addIssue(mockModel, issue);
    }

    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 4);
    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 0);

    issuesManager.unhideAllIssues();

    assert.strictEqual(aggregator.numberOfAggregatedIssues(), 4);
    assert.strictEqual(aggregator.numberOfHiddenAggregatedIssues(), 0);
  });
});
