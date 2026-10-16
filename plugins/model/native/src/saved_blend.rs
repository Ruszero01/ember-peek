use crate::{
    mesh::{Mesh, FALLBACK_COLOR},
    FILE_LIMIT,
};
use blend::{Blend, Instance};
use std::{borrow::Cow, io::Read};

fn decompress(bytes: &[u8]) -> Result<Cow<'_, [u8]>, String> {
    let mut input: Box<dyn Read + '_> = if bytes.starts_with(&[0x1f, 0x8b]) {
        Box::new(flate2::read::GzDecoder::new(bytes))
    } else if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        Box::new(zstd::stream::read::Decoder::new(bytes).map_err(|e| e.to_string())?)
    } else {
        return Ok(Cow::Borrowed(bytes));
    };
    let mut out = Vec::new();
    input
        .by_ref()
        .take(FILE_LIMIT + 1)
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    if out.len() as u64 > FILE_LIMIT {
        return Err("Expanded Blender file exceeds 1024 MiB".into());
    }
    Ok(Cow::Owned(out))
}
// Reject oversized/truncated block tables before invoking the lazy third-party DNA reader.
fn validate_blocks(bytes: &[u8]) -> Result<(), String> {
    if !bytes.starts_with(b"BLENDER") || bytes.len() < 12 {
        return Err("Invalid Blender header".into());
    }
    let modern = bytes[7].is_ascii_digit();
    let (mut offset, header, little) = if modern {
        if bytes.len() < 17 || &bytes[7..9] != b"17" || bytes[9] != b'-' || bytes[12] != b'v' {
            return Err("Unsupported Blender header".into());
        }
        (17usize, 32usize, true)
    } else {
        if !matches!(bytes[7], b'_' | b'-') || !matches!(bytes[8], b'v' | b'V') {
            return Err("Invalid Blender header".into());
        }
        (12, if bytes[7] == b'-' { 24 } else { 20 }, bytes[8] == b'v')
    };
    for _ in 0..100000 {
        let block = bytes
            .get(offset..offset + header)
            .ok_or("Truncated Blender block")?;
        if &block[..4] == b"ENDB" {
            return Ok(());
        }
        let length = if modern {
            u64::from_le_bytes(block[16..24].try_into().unwrap())
        } else if little {
            u32::from_le_bytes(block[4..8].try_into().unwrap()) as u64
        } else {
            u32::from_be_bytes(block[4..8].try_into().unwrap()) as u64
        };
        let length = usize::try_from(length).map_err(|_| "Blender block length overflow")?;
        if length > FILE_LIMIT as usize || (&block[..4] == b"DNA1" && length > 8 * 1024 * 1024) {
            return Err("Blender block exceeds preview limit".into());
        }
        offset = offset
            .checked_add(header)
            .and_then(|n| n.checked_add(length))
            .filter(|n| *n <= bytes.len())
            .ok_or("Truncated Blender block data")?;
    }
    Err("Too many Blender blocks".into())
}
fn field<'a>(object: &Instance<'a>, names: &[&str]) -> Option<Instance<'a>> {
    names
        .iter()
        .find(|n| object.is_valid(**n))
        .map(|name| object.get(*name))
}
fn count(object: &Instance<'_>, names: &[&str]) -> Result<usize, String> {
    let name = names
        .iter()
        .find(|name| object.fields.contains_key(**name))
        .ok_or("Unsupported saved mesh layout")?;
    let n = object.get_i32(*name);
    if !(0..=1500000).contains(&n) {
        return Err("Invalid Blender mesh count".into());
    }
    Ok(n as usize)
}
fn layer<'a>(mesh: &Instance<'a>, containers: &[&str], name: &str) -> Option<Instance<'a>> {
    if mesh.is_valid("attribute_storage") {
        let storage = mesh.get("attribute_storage");
        if storage.is_valid("dna_attributes") {
            if let Some(attribute) = storage.get_iter("dna_attributes").take(128).find(|a| {
                let bytes = a.get_u8_vec("name");
                let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
                &bytes[..end] == name.as_bytes()
            }) {
                if attribute.get_i8("storage_type") != 0 {
                    return None;
                }
                let array = attribute.get("data");
                if array.get_i8("is_single") != 0 {
                    return None;
                }
                return Some(array);
            }
        }
    }
    let data = field(mesh, containers)?;
    if !data.is_valid("layers") {
        return None;
    }
    data.get_iter("layers")
        .take(128)
        .find(|layer| layer.get_string("name") == name)
}
fn positions(mesh: &Instance<'_>, n: usize) -> Result<Vec<[f32; 3]>, String> {
    if mesh.is_valid("mvert") {
        let points: Vec<_> = mesh
            .get_iter("mvert")
            .take(n + 1)
            .map(|v| {
                v.get_f32_vec("co")
                    .try_into()
                    .map_err(|_| "Invalid vertex".to_string())
            })
            .collect::<Result<_, _>>()?;
        if points.len() != n {
            return Err("Invalid vertex count".into());
        }
        return Ok(points);
    }
    let data = layer(mesh, &["vert_data", "vdata"], "position")
        .ok_or("Saved vertex positions are missing")?
        .get_f32_vec("data");
    if data.len() != n * 3 {
        return Err("Invalid saved position count".into());
    }
    Ok(data.as_chunks::<3>().0.to_vec())
}
fn faces(mesh: &Instance<'_>) -> Result<Vec<Vec<usize>>, String> {
    let n = count(mesh, &["faces_num", "totpoly"])?;
    let corners = count(mesh, &["corners_num", "totloop"])?;
    if n > 200000 || corners > 1500000 {
        return Err("Blender mesh exceeds preview limit".into());
    }
    let loops: Vec<i32> = if mesh.is_valid("mloop") {
        mesh.get_iter("mloop")
            .take(corners + 1)
            .map(|v| v.get_i32("v"))
            .collect()
    } else {
        layer(mesh, &["corner_data", "ldata"], ".corner_vert")
            .ok_or("Saved mesh corners are missing")?
            .get_i32_vec("data")
    };
    if loops.len() != corners {
        return Err("Invalid corner count".into());
    }
    let ranges: Vec<(usize, usize)> = if mesh.is_valid("mpoly") {
        mesh.get_iter("mpoly")
            .take(n + 1)
            .map(|p| {
                let start = p.get_i32("loopstart");
                let length = p.get_i32("totloop");
                if start < 0 || !(3..=4096).contains(&length) {
                    return Err("Invalid polygon range".to_string());
                }
                Ok((start as usize, length as usize))
            })
            .collect::<Result<_, _>>()?
    } else {
        let key = ["face_offset_indices", "poly_offset_indices"]
            .into_iter()
            .find(|key| mesh.is_valid(*key))
            .ok_or("Saved face offsets are missing")?;
        let offsets = mesh.get_i32_vec(key);
        if offsets.len() != n + 1 {
            return Err("Invalid face offset count".into());
        }
        offsets
            .windows(2)
            .map(|p| {
                let length = p[1] - p[0];
                if p[0] < 0 || !(3..=4096).contains(&length) {
                    return Err("Invalid polygon offsets".to_string());
                }
                Ok((p[0] as usize, length as usize))
            })
            .collect::<Result<_, _>>()?
    };
    if ranges.len() != n {
        return Err("Invalid polygon count".into());
    }
    ranges
        .into_iter()
        .map(|(start, length)| {
            let points = loops
                .get(start..start.checked_add(length).ok_or("Polygon range overflow")?)
                .ok_or("Polygon exceeds corner array")?;
            points
                .iter()
                .map(|v| usize::try_from(*v).map_err(|_| "Invalid vertex index".into()))
                .collect()
        })
        .collect()
}
type Matrix = [f32; 16];
fn identity() -> Matrix {
    [
        1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.,
    ]
}
fn multiply(a: Matrix, b: Matrix) -> Matrix {
    std::array::from_fn(|i| (0..4).map(|k| a[k * 4 + i % 4] * b[i / 4 * 4 + k]).sum())
}
fn transform(object: &Instance<'_>, depth: usize) -> Result<Matrix, String> {
    if depth > 64 {
        return Err("Blender parent hierarchy exceeds preview limit".into());
    }
    for name in ["obmat", "object_to_world"] {
        if object.is_valid(name) {
            let m = object.get_f32_vec(name);
            if let Ok(m) = m.try_into() {
                return Ok(m);
            }
        }
    }
    let loc = object.get_f32_vec("loc");
    let scale = object.get_f32_vec("size");
    let mode = object.get_i16("rotmode");
    let mut local = identity();
    if mode == 0 {
        let q = object.get_f32_vec("quat");
        if q.len() != 4 {
            return Err("Invalid object rotation".into());
        }
        let (w, x, y, z) = (q[0], q[1], q[2], q[3]);
        local = [
            1. - 2. * (y * y + z * z),
            2. * (x * y + z * w),
            2. * (x * z - y * w),
            0.,
            2. * (x * y - z * w),
            1. - 2. * (x * x + z * z),
            2. * (y * z + x * w),
            0.,
            2. * (x * z + y * w),
            2. * (y * z - x * w),
            1. - 2. * (x * x + y * y),
            0.,
            0.,
            0.,
            0.,
            1.,
        ];
    } else if (1..=6).contains(&mode) {
        let e = object.get_f32_vec("rot");
        if e.len() != 3 {
            return Err("Invalid object rotation".into());
        }
        let order = match mode {
            1 => [0, 1, 2],
            2 => [0, 2, 1],
            3 => [1, 0, 2],
            4 => [1, 2, 0],
            5 => [2, 0, 1],
            _ => [2, 1, 0],
        };
        for axis in order {
            let (s, c) = e[axis].sin_cos();
            let rotation = match axis {
                0 => [1., 0., 0., 0., 0., c, s, 0., 0., -s, c, 0., 0., 0., 0., 1.],
                1 => [c, 0., -s, 0., 0., 1., 0., 0., s, 0., c, 0., 0., 0., 0., 1.],
                _ => [c, s, 0., 0., -s, c, 0., 0., 0., 0., 1., 0., 0., 0., 0., 1.],
            };
            local = multiply(rotation, local);
        }
    } else {
        return Err("Unsupported saved object rotation".into());
    }
    if loc.len() != 3 || scale.len() != 3 {
        return Err("Invalid object transform".into());
    }
    for i in 0..3 {
        for row in 0..3 {
            local[i * 4 + row] *= scale[i];
        }
        local[12 + i] = loc[i];
    }
    if object.is_valid("parent") {
        let inverse: Matrix = object
            .get_f32_vec("parentinv")
            .try_into()
            .map_err(|_| "Invalid parent transform")?;
        local = multiply(
            multiply(transform(&object.get("parent"), depth + 1)?, inverse),
            local,
        );
    }
    Ok(local)
}
fn material(object: &Instance<'_>, mesh: &Instance<'_>) -> [f32; 3] {
    let owner = if object.is_valid("mat") { object } else { mesh };
    if !owner.is_valid("mat") {
        return FALLBACK_COLOR;
    }
    let Some(material) = owner.get_iter("mat").next() else {
        return FALLBACK_COLOR;
    };
    if material.is_valid("nodetree") {
        let tree = material.get("nodetree");
        if tree.is_valid("nodes") {
            for node in tree.get_iter("nodes").take(128) {
                if node.get_string("idname") != "ShaderNodeBsdfPrincipled"
                    || !node.is_valid("inputs")
                {
                    continue;
                }
                for socket in node.get_iter("inputs").take(64) {
                    if socket.get_string("name") == "Base Color" && socket.is_valid("default_value")
                    {
                        let value = socket.get_f32_vec("default_value");
                        if value.len() >= 3 {
                            return value[..3].try_into().unwrap();
                        }
                    }
                }
            }
        }
    }
    if ["r", "g", "b"]
        .iter()
        .all(|k| material.fields.contains_key(*k))
    {
        return [
            material.get_f32("r"),
            material.get_f32("g"),
            material.get_f32("b"),
        ];
    }
    FALLBACK_COLOR
}
fn parse(bytes: &[u8]) -> Result<Mesh, String> {
    let blend = Blend::new(bytes).map_err(|e| format!("Invalid Blender file: {e:?}"))?;
    let mut out = Mesh::default();
    for object in blend.instances_with_code(*b"OB").take(10001) {
        if object.get_i16("type") != 1 {
            continue;
        }
        if !object.is_valid("data") {
            out.skipped += 1;
            continue;
        }
        if out.objects >= 10000 {
            return Err("Too many Blender objects".into());
        }
        let mesh = object.get("data");
        let points = positions(&mesh, count(&mesh, &["verts_num", "totvert"])?)?;
        let world = transform(&object, 0)?;
        let color = material(&object, &mesh);
        if object.is_valid("modifiers") {
            out.skipped += 1;
        }
        for indices in faces(&mesh)? {
            let face: Vec<[f32; 3]> = indices
                .iter()
                .map(|i| {
                    let p = points.get(*i).ok_or("Invalid polygon vertex")?;
                    let x = world[0] * p[0] + world[4] * p[1] + world[8] * p[2] + world[12];
                    let y = world[1] * p[0] + world[5] * p[1] + world[9] * p[2] + world[13];
                    let z = world[2] * p[0] + world[6] * p[1] + world[10] * p[2] + world[14];
                    Ok([x, z, -y])
                })
                .collect::<Result<_, String>>()?;
            // Project onto the dominant plane and triangulate concave polygons.
            let mut normal = [0_f64; 3];
            for i in 0..face.len() {
                let a = face[i];
                let b = face[(i + 1) % face.len()];
                normal[0] += ((a[1] - b[1]) * (a[2] + b[2])) as f64;
                normal[1] += ((a[2] - b[2]) * (a[0] + b[0])) as f64;
                normal[2] += ((a[0] - b[0]) * (a[1] + b[1])) as f64;
            }
            let axis = (0..3)
                .max_by(|a, b| normal[*a].abs().total_cmp(&normal[*b].abs()))
                .unwrap();
            let coordinates: Vec<f64> = face
                .iter()
                .flat_map(|p| (0..3).filter(move |i| *i != axis).map(move |i| p[i] as f64))
                .collect();
            let triangles = earcutr::earcut(&coordinates, &[], 2)
                .map_err(|_| "Could not triangulate saved polygon")?;
            for triangle in triangles.as_chunks::<3>().0 {
                out.triangle(
                    [face[triangle[0]], face[triangle[1]], face[triangle[2]]],
                    color,
                )?;
            }
        }
        out.objects += 1;
    }
    Ok(out)
}
pub fn read(bytes: &[u8]) -> Result<Mesh, String> {
    let bytes = decompress(bytes)?;
    validate_blocks(&bytes)?;
    // The dependency documents panic-based errors; keep them inside this plugin boundary.
    std::panic::catch_unwind(|| parse(&bytes))
        .map_err(|_| "Unsupported or malformed saved Blender mesh".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uncompressed_input_is_borrowed() {
        let bytes = b"BLENDER-v300";
        assert!(
            matches!(decompress(bytes).unwrap(), Cow::Borrowed(value) if std::ptr::eq(value.as_ptr(), bytes.as_ptr()))
        );
    }
    #[test]
    fn saved_cube_reads_base_geometry_and_color_without_running_blender() {
        let bytes = include_bytes!("../../../../tests/fixtures/model/saved-base-mesh.blend");
        let mesh = read(bytes).unwrap();
        assert_eq!(mesh.objects, 1);
        assert_eq!(mesh.positions.len() / 3, 12);
        assert_eq!(mesh.skipped, 1);
        assert!((mesh.colors[0][0] - 0.8).abs() < 0.001);
        let minimum = mesh
            .positions
            .iter()
            .map(|p| p[0])
            .fold(f32::INFINITY, f32::min);
        assert!((minimum - 2.0).abs() < 0.001);
        let expanded = decompress(bytes).unwrap();
        assert!(read(&expanded).is_ok());
    }
    #[test]
    fn malformed_and_truncated_blocks_are_rejected() {
        assert!(read(b"not blend").is_err());
        assert!(read(b"BLENDER-v300DATA").is_err());
        let mut bytes = b"BLENDER-v300DATA".to_vec();
        bytes.extend(u32::MAX.to_le_bytes());
        bytes.extend([0; 16]);
        assert!(read(&bytes).is_err());
    }
    #[test]
    fn parent_matrix_multiplication_preserves_translation() {
        let mut a = identity();
        a[12] = 10.;
        let mut b = identity();
        b[13] = 20.;
        let m = multiply(a, b);
        assert_eq!(&m[12..15], &[10., 20., 0.]);
    }
}
