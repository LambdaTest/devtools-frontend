// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as LitHtml from '../../lit-html/lit-html.js';
import * as ComponentHelpers from '../helpers/helpers.js';
import * as IconButton from '../icon_button/icon_button.js';
import linearMemoryValueInterpreterStyles from './linearMemoryValueInterpreter.css.js';

import {ValueInterpreterDisplay} from './ValueInterpreterDisplay.js';
import {ValueInterpreterSettings} from './ValueInterpreterSettings.js';

import type {ValueDisplayData} from './ValueInterpreterDisplay.js';
import type {ValueType, ValueTypeMode} from './ValueInterpreterDisplayUtils.js';
import {Endianness} from './ValueInterpreterDisplayUtils.js';
import type {TypeToggleEvent, ValueInterpreterSettingsData} from './ValueInterpreterSettings.js';

import * as i18n from '../../../core/i18n/i18n.js';
import inspectorCommonStyles from '../../legacy/inspectorCommon.css.js';

const UIStrings = {
  /**
  *@description Tooltip text that appears when hovering over the gear button to open and close settings in the Linear Memory Inspector. These settings
  *             allow the user to change the value type to view, such as 32-bit Integer, or 32-bit Float.
  */
  toggleValueTypeSettings: 'Toggle value type settings',
  /**
  *@description Tooltip text that appears when hovering over the 'Little Endian' or 'Big Endian' setting in the Linear Memory Inspector.
  */
  changeEndianness: 'Change `Endianness`',
};
const str_ =
    i18n.i18n.registerUIStrings('ui/components/linear_memory_inspector/LinearMemoryValueInterpreter.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

const {render, html} = LitHtml;

export class EndiannessChangedEvent extends Event {
  data: Endianness;

  constructor(endianness: Endianness) {
    super('endiannesschanged');
    this.data = endianness;
  }
}

export class ValueTypeToggledEvent extends Event {
  data: {type: ValueType, checked: boolean};

  constructor(type: ValueType, checked: boolean) {
    super('valuetypetoggled');
    this.data = {type, checked};
  }
}

export interface LinearMemoryValueInterpreterData {
  value: ArrayBuffer;
  valueTypes: Set<ValueType>;
  endianness: Endianness;
  valueTypeModes?: Map<ValueType, ValueTypeMode>;
  memoryLength: number;
}

export class LinearMemoryValueInterpreter extends HTMLElement {
  static readonly litTagName = LitHtml.literal`devtools-linear-memory-inspector-interpreter`;

  private readonly shadow = this.attachShadow({mode: 'open'});
  private endianness = Endianness.Little;
  private buffer = new ArrayBuffer(0);
  private valueTypes: Set<ValueType> = new Set();
  private valueTypeModeConfig: Map<ValueType, ValueTypeMode> = new Map();
  private memoryLength = 0;
  private showSettings = false;

  constructor() {
    super();
    this.shadow.adoptedStyleSheets = [
      inspectorCommonStyles,
    ];
  }

  connectedCallback(): void {
    this.shadow.adoptedStyleSheets = [linearMemoryValueInterpreterStyles];
  }

  set data(data: LinearMemoryValueInterpreterData) {
    this.endianness = data.endianness;
    this.buffer = data.value;
    this.valueTypes = data.valueTypes;
    this.valueTypeModeConfig = data.valueTypeModes || new Map();
    this.memoryLength = data.memoryLength;
    this.render();
  }

  private render(): void {
    // Disabled until https://crbug.com/1079231 is fixed.
    // clang-format off
    render(html`
      <div class="value-interpreter">
        <div class="settings-toolbar">
          ${this.renderEndiannessSetting()}
          <button data-settings="true" class="settings-toolbar-button ${this.showSettings ? 'active' : ''}" title=${i18nString(UIStrings.toggleValueTypeSettings)} @click=${this.onSettingsToggle}>
            <${IconButton.Icon.Icon.litTagName}
              .data=${{ iconName: 'settings_14x14_icon', color: 'var(--color-text-secondary)', width: '14px' } as IconButton.Icon.IconWithName}>
            </${IconButton.Icon.Icon.litTagName}>
          </button>
        </div>
        <span class="divider"></span>
        <div>
          ${this.showSettings ?
            html`
              <${ValueInterpreterSettings.litTagName}
                .data=${{ valueTypes: this.valueTypes } as ValueInterpreterSettingsData}
                @typetoggle=${this.onTypeToggle}>
              </${ValueInterpreterSettings.litTagName}>` :
            html`
              <${ValueInterpreterDisplay.litTagName}
                .data=${{
                  buffer: this.buffer,
                  valueTypes: this.valueTypes,
                  endianness: this.endianness,
                  valueTypeModes: this.valueTypeModeConfig,
                  memoryLength: this.memoryLength,
                } as ValueDisplayData}>
              </${ValueInterpreterDisplay.litTagName}>`}
        </div>
      </div>
    `,
      this.shadow, { host: this },
    );
    // clang-format on
  }

  private onEndiannessChange(event: Event): void {
    event.preventDefault();
    const select = event.target as HTMLInputElement;
    const endianness = select.value as Endianness;
    this.dispatchEvent(new EndiannessChangedEvent(endianness));
  }

  private renderEndiannessSetting(): LitHtml.TemplateResult {
    const onEnumSettingChange = this.onEndiannessChange.bind(this);
    // Disabled until https://crbug.com/1079231 is fixed.
    // clang-format off
    return html`
    <label data-endianness-setting="true" title=${i18nString(UIStrings.changeEndianness)}>
      <select class="chrome-select"
        style="border: none; background-color: transparent; cursor: pointer;"
        data-endianness="true" @change=${onEnumSettingChange}>
        ${[Endianness.Little, Endianness.Big].map(endianness => {
            return html`<option value=${endianness} .selected=${this.endianness === endianness}>${
                i18n.i18n.lockedString(endianness)}</option>`;
        })}
      </select>
    </label>
    `;
    // clang-format on
  }

  private onSettingsToggle(): void {
    this.showSettings = !this.showSettings;
    this.render();
  }

  private onTypeToggle(e: TypeToggleEvent): void {
    this.dispatchEvent(new ValueTypeToggledEvent(e.data.type, e.data.checked));
  }
}

ComponentHelpers.CustomElements.defineComponent(
    'devtools-linear-memory-inspector-interpreter', LinearMemoryValueInterpreter);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLElementTagNameMap {
    'devtools-linear-memory-inspector-interpreter': LinearMemoryValueInterpreter;
  }
}
