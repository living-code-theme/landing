<!-- living-code-readme:1 -->
# 📝 Living Code for Neovim

**Calm slate. Living color.** A color theme for Neovim.

[Installation](#installation) · [Flavors](#flavors) · [Configuration](#configuration) · [All ports](https://github.com/living-code-theme)

## Previews

<table data-lc-flavors>
<tr>
<td width="50%" valign="top">
<strong>Night</strong><br><sub>Dark · full palette</sub><br><br>
<a href="images/night.png"><img src="images/night.png" alt="Neovim in night" width="640"></a>
</td>
<td width="50%" valign="top">
<strong>Paper</strong><br><sub>Light · near-white slate</sub><br><br>
<a href="images/paper.png"><img src="images/paper.png" alt="Neovim in paper" width="640"></a>
</td>
</tr>
</table>

Select any preview to view the image at full size.

## Installation

Install with your plugin manager.

```lua
{ "living-code-theme/nvim" }
```

## Flavors

Expand a flavor for its full-size preview and activation instructions.

<details data-lc-flavor="night">
<summary><strong>Night</strong> · Dark · full palette</summary>

<p><a href="images/night.png"><img src="images/night.png" alt="Neovim in night" width="1280"></a></p>

Activate this flavor:

```vim
:colorscheme living-code-night
```

</details>

<details data-lc-flavor="paper">
<summary><strong>Paper</strong> · Light · near-white slate</summary>

<p><a href="images/paper.png"><img src="images/paper.png" alt="Neovim in paper" width="1280"></a></p>

Activate this flavor:

```vim
:colorscheme living-code-paper
```

</details>

## Configuration

```lua
require("living-code").setup({ transparent = true })
```

## Compatibility

Requires Neovim and true color.

## Contributing

Found a problem? Open an issue in this repository with the app version, the flavor and a screenshot. Want Living Code somewhere else? [Request a port](https://github.com/living-code-theme/core/issues/new?template=port-request.yml).

Pull requests are welcome. Keep this README, `port.json` and `images/` in sync, and use real screenshots of the app, never mockups.

🦎 **One chameleon, many habitats.** Part of [Living Code](https://github.com/living-code-theme).

## License

[MIT](LICENSE) © Elliot Luque
