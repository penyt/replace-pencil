import {
  Plugin,
  Notice,
  PluginSettingTab,
  App,
  Setting
} from "obsidian";

interface ReplacePluginSettings {
  placeholderPrefix: string;
}

const DEFAULT_SETTINGS: ReplacePluginSettings = {
  placeholderPrefix: "<"
};

const pairedSuffix: Record<string, string> = {
  "<": ">",
  "{": "}",
  "[": "]",
  "(": ")",
  "{{": "}}",
  "[[": "]]",
  "((": "))"
};

export default class ReplaceInCodeBlockPlugin extends Plugin {
  settings: ReplacePluginSettings;

  async onload() {
    await this.loadSettings();

    if (localStorage.getItem("replace-pencil-reset-pending") === "true") {
      new Notice("Done reset!");
      localStorage.removeItem("replace-pencil-reset-pending");
    }

    this.addRibbonIcon("eraser", "Reset all replace-pencil block", () => {
      localStorage.setItem("replace-pencil-reset-pending", "true");
      location.reload();
    });

    this.addSettingTab(new ReplaceSettingTab(this.app, this));

    this.registerMarkdownPostProcessor((el, ctx) => {
      const preBlocks = el.querySelectorAll("pre");

      preBlocks.forEach((preEl) => {
        const codeEl = preEl.querySelector("code");
        if (!codeEl) return;

        const prefix = this.settings.placeholderPrefix || "<";
        const suffix = pairedSuffix[prefix];

        if (!suffix) {
          new Notice(`Unsupported placeholder prefix: ${prefix}`);
          return;
        }

        const escapedPrefix = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const escapedSuffix = suffix.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const pattern = new RegExp(`${escapedPrefix}([\\w\\-]+)${escapedSuffix}`, "g");

        const originalText = codeEl.textContent || "";
        const varMatches = Array.from(new Set(originalText.match(pattern) || []));
        if (!varMatches.length) return;

        preEl.classList.add("replace-pencil-pre");

        const vars: Record<string, string> = {};
        const container = document.createElement("div");
        container.classList.add("replace-pencil-container");
        preEl.insertAdjacentElement("beforebegin", container);

        varMatches.forEach((match) => {
          const key = match.slice(prefix.length, match.length - suffix.length);
          vars[key] = "";

          const inputWrapper = document.createElement("div");
          inputWrapper.classList.add("replace-pencil-input-wrapper");

          const input = document.createElement("input");
          input.type = "text";
          input.placeholder = key;
          input.classList.add("replace-pencil-input");

          this.registerDomEvent(input, "input", () => {
            vars[key] = input.value;
            renderCode();
          });

          const clearButton = document.createElement("button");
          clearButton.textContent = "Clear";
          clearButton.classList.add("replace-pencil-clear-button");

          this.registerDomEvent(clearButton, "click", () => {
            input.value = "";
            vars[key] = "";
            renderCode();
          });

          inputWrapper.appendChild(input);
          inputWrapper.appendChild(clearButton);
          container.appendChild(inputWrapper);
        });

        const copyButton = document.createElement("button");
        copyButton.className = "replace-pencil-copy-button";
        copyButton.textContent = "Copy";
        preEl.appendChild(copyButton);

        this.registerDomEvent(copyButton, "click", () => {
          const text = generatePureText();
          navigator.clipboard.writeText(text).then(() => {
            copyButton.textContent = "Copied!";
            setTimeout(() => {
              copyButton.textContent = "Copy";
            }, 1500);
          });
        });

        const renderCode = () => {
          while (codeEl.firstChild) codeEl.removeChild(codeEl.firstChild);

          const fragments = originalText.split(
            new RegExp(`(${escapedPrefix}[\\w\\-]+${escapedSuffix})`, "g")
          );

          for (const frag of fragments) {
            const match = frag.match(
              new RegExp(`^${escapedPrefix}([\\w\\-]+)${escapedSuffix}$`)
            );
            if (match) {
              const key = match[1];
              const span = document.createElement("span");
              if (vars[key]) {
                span.textContent = vars[key];
                span.className = "replace-pencil-replaced";
              } else {
                span.textContent = frag;
              }
              codeEl.appendChild(span);
            } else {
              codeEl.appendChild(document.createTextNode(frag));
            }
          }
        };

        const generatePureText = (): string => {
          let result = originalText;
          Object.keys(vars).forEach((key) => {
            const regex = new RegExp(
              `${escapedPrefix}${key}${escapedSuffix}`,
              "g"
            );
            result = result.replace(regex, vars[key] || `${prefix}${key}${suffix}`);
          });
          return result;
        };

        renderCode();
      });
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ReplaceSettingTab extends PluginSettingTab {
  plugin: ReplaceInCodeBlockPlugin;

  constructor(app: App, plugin: ReplaceInCodeBlockPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setHeading()
      .setName("Replace Pencil options");

    new Setting(containerEl)
      .setName("Placeholder prefix")
      .addText((text) =>
        text
          .setPlaceholder("<")
          .setValue(this.plugin.settings.placeholderPrefix)
          .onChange(async (value) => {
            const trimmed = value.trim();
            this.plugin.settings.placeholderPrefix = trimmed || "<";
            await this.plugin.saveSettings();
          })
      )
      .descEl.appendChild(createFragment((frag) => {
        frag.appendText("Prefix used for variable placeholders. Only use one of: <, {, [, ( or their doubled versions like {{.");
        frag.appendChild(document.createElement("br"));
        frag.appendText("Use the 'eraser' button or command palette to reload and apply.");
      }));
  }
}