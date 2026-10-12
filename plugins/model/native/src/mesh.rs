pub const TRIANGLE_LIMIT: usize = 4_000_000;
pub const FALLBACK_COLOR: [f32; 3] = [0.55, 0.62, 0.7];

#[derive(Default)]
pub struct Mesh {
    pub lines: Vec<([f32; 3], [f32; 3])>,
    pub line_colors: Vec<[f32; 3]>,
    pub positions: Vec<[f32; 3]>,
    pub colors: Vec<[f32; 3]>,
    pub objects: u32,
    pub skipped: u32,
    pub simplified: bool,
    pub booleans: Vec<BooleanJob>,
}
#[derive(serde::Serialize)]
pub struct BooleanJob {
    pub start: usize,
    pub count: usize,
    pub cutter_start: usize,
    pub cutter_count: usize,
}
impl Mesh {
    pub fn triangle(&mut self, points: [[f32; 3]; 3], color: [f32; 3]) -> Result<(), String> {
        if self.positions.len() / 3 >= TRIANGLE_LIMIT {
            return Err("Saved geometry exceeds 4,000,000 triangles".into());
        }
        if points
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || v.abs() > 1e12)
        {
            return Err("Invalid model coordinate".into());
        }
        self.positions.extend(points);
        self.colors.extend(
            [color.map(|v| {
                if v.is_finite() {
                    v.clamp(0.0, 1.0)
                } else {
                    0.6
                }
            }); 3],
        );
        Ok(())
    }
    pub fn line(&mut self, points: [[f32; 3]; 2], color: [f32; 3]) -> Result<(), String> {
        if self.lines.len() >= 1_000_000 {
            return Err("Too many saved line segments".into());
        }
        if points
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || v.abs() > 1e12)
        {
            return Err("Invalid line coordinate".into());
        }
        self.lines.push((points[0], points[1]));
        self.line_colors
            .push(color.map(|v| if v.is_finite() { v.clamp(0., 1.) } else { 0.6 }));
        Ok(())
    }
    pub fn bytes(&self) -> Result<Vec<u8>, String> {
        if self.positions.is_empty() && self.lines.is_empty() {
            return Err("No saved polygon geometry found".into());
        }
        let mut low = [f32::INFINITY; 3];
        let mut high = [f32::NEG_INFINITY; 3];
        for (index, p) in self.positions.iter().enumerate() {
            if self.booleans.iter().any(|job| {
                (job.cutter_start..job.cutter_start + job.cutter_count).contains(&(index / 3))
            }) {
                continue;
            }
            for i in 0..3 {
                low[i] = low[i].min(p[i]);
                high[i] = high[i].max(p[i]);
            }
        }
        for (a, b) in &self.lines {
            for p in [a, b] {
                for i in 0..3 {
                    low[i] = low[i].min(p[i]);
                    high[i] = high[i].max(p[i]);
                }
            }
        }
        let center = std::array::from_fn::<_, 3, _>(|i| (low[i] + high[i]) * 0.5);
        let span = (0..3).map(|i| high[i] - low[i]).fold(0.0_f32, f32::max);
        if !span.is_finite() || span <= 1e-12 {
            return Err("Model has no spatial extent".into());
        }
        let mut bytes = Vec::with_capacity(self.positions.len() * 36);
        for (face_index, face) in self.positions.chunks_exact(3).enumerate() {
            let p: [[f32; 3]; 3] = std::array::from_fn(|v| {
                std::array::from_fn(|i| (face[v][i] - center[i]) * 2.0 / span)
            });
            let a = std::array::from_fn::<_, 3, _>(|i| p[1][i] - p[0][i]);
            let b = std::array::from_fn::<_, 3, _>(|i| p[2][i] - p[0][i]);
            let mut n = [
                a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0],
            ];
            let length = n.iter().map(|v| v * v).sum::<f32>().sqrt();
            if length > 1e-12 {
                for v in &mut n {
                    *v /= length;
                }
            }
            for (vertex, position) in p.iter().enumerate() {
                for value in position
                    .iter()
                    .chain(n.iter())
                    .chain(self.colors[face_index * 3 + vertex].iter())
                {
                    bytes.extend(value.to_le_bytes());
                }
            }
        }
        for (index, (a, b)) in self.lines.iter().enumerate() {
            for point in [a, b] {
                let p = std::array::from_fn::<_, 3, _>(|i| (point[i] - center[i]) * 2.0 / span);
                for v in p
                    .iter()
                    .chain([0.0_f32; 3].iter())
                    .chain(self.line_colors[index].iter())
                {
                    bytes.extend(v.to_le_bytes());
                }
            }
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn line_only_geometry_has_normalized_extent_and_color() {
        let mut mesh = Mesh::default();
        mesh.line([[10., 0., 0.], [12., 0., 0.]], [1., 0., 0.])
            .unwrap();
        let bytes = mesh.bytes().unwrap();
        assert_eq!(bytes.len(), 72);
        let values: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|p| f32::from_le_bytes(p.try_into().unwrap()))
            .collect();
        assert_eq!(values[0], -1.);
        assert_eq!(values[9], 1.);
        assert_eq!(&values[6..9], &[1., 0., 0.]);
        assert!(mesh
            .line([[f32::NAN, 0., 0.], [0., 0., 0.]], FALLBACK_COLOR)
            .is_err());
    }
    #[test]
    fn geometry_is_normalized_with_flat_normals_and_color() {
        let mut mesh = Mesh::default();
        mesh.triangle([[10., 0., 0.], [12., 0., 0.], [10., 2., 0.]], [1., 0., 0.])
            .unwrap();
        let bytes = mesh.bytes().unwrap();
        let values: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
            .collect();
        assert_eq!(&values[..9], &[-1., -1., 0., 0., 0., 1., 1., 0., 0.]);
        assert_eq!(bytes.len(), 108);
        assert!(mesh
            .triangle([[f32::NAN, 0., 0.]; 3], FALLBACK_COLOR)
            .is_err());
    }
    #[test]
    fn hidden_cutters_do_not_change_base_normalization() {
        let mut mesh = Mesh::default();
        mesh.triangle([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]], FALLBACK_COLOR)
            .unwrap();
        let base = mesh.bytes().unwrap();
        mesh.triangle(
            [[1000., 0., 0.], [1002., 0., 0.], [1000., 2., 0.]],
            FALLBACK_COLOR,
        )
        .unwrap();
        mesh.booleans.push(BooleanJob {
            start: 0,
            count: 1,
            cutter_start: 1,
            cutter_count: 1,
        });
        assert_eq!(&mesh.bytes().unwrap()[..108], &base);
    }
}
