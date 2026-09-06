# STL Print Doctor

A modern, browser-based STL viewer and conservative mesh repair utility for 3D printing. Files are processed entirely on the user's device.

## Features

- Binary and ASCII STL loading
- Solid, wireframe, X-ray, and issue-highlight views
- Dimensions, triangle count, surface area, volume, shells, and material-weight estimate
- Detection of open edges, non-manifold edges, degenerate faces, and duplicate faces
- Conservative repair: welds coincident vertices, removes duplicate/degenerate faces, corrects global winding, and recalculates normals
- Bambu Lab P1S and other build-volume profiles
- Resize, rotate, center, place on bed, screenshot, restore, and repaired STL export
- Responsive dark and light themes

## Run locally

Because the app uses JavaScript modules, serve the `dist` folder through a local web server:

```bash
cd dist
python -m http.server 8000
```

Open `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a new GitHub repository and upload the complete project.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push to `main`. The included workflow publishes the `dist` folder automatically.

## Repair limitations

The repair operation intentionally avoids changing the shape aggressively. It does not fill large holes, resolve self-intersections, create thickness, or guarantee that every damaged mesh becomes watertight. Always inspect the highlighted issues and preview the result in your slicer before printing.

## Technology

Static HTML/CSS/JavaScript with Three.js. No server, account, or build step is required.

## License

MIT
